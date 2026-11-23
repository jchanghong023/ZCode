"""Import one confirmed AIReq document snapshot into the current Git worktree."""

import getpass
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


DOCUMENTS_PATH = "/api/aireq/confirmed-documents"
QUERY_KEYS = ("aireqProject", "aireqRelease", "aireqIr")


class SyncError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # 下载令牌只交给需求链接指定的平台。
        return None


def download_bundle(link):
    url = urlsplit(link)
    query = parse_qs(url.query)
    if (
        url.scheme not in ("http", "https")
        or not url.hostname
        or url.username is not None
        or any(len(query.get(key, [])) != 1 for key in QUERY_KEYS)
    ):
        raise SyncError("请使用需求共创复制的需求链接。")
    query = {key: query[key][0] for key in QUERY_KEYS}
    endpoint = urlunsplit((url.scheme, url.netloc, DOCUMENTS_PATH, urlencode(query), ""))
    http = build_opener(NoRedirect())
    request = Request(endpoint, headers={"Accept": "application/json"})
    try:
        try:
            response = http.open(request, timeout=30)
        except HTTPError as error:
            if error.code != 401:
                raise
            error.close()
            token = os.environ.get("AIREQ_SYNC_TOKEN") or getpass.getpass("请输入平台访问令牌：")
            if not token.strip():
                raise SyncError("需要平台访问令牌。")
            request.add_header("Authorization", f"Bearer {token.strip()}")
            response = http.open(request, timeout=30)
        with response:
            bundle = json.load(response)
    except HTTPError as error:
        with error:
            try:
                message = json.load(error)["error"]["message"]
            except (ValueError, TypeError, KeyError):
                message = "无法下载定版文档。"
        raise SyncError(f"{message}（HTTP {error.code}）") from None
    except (ValueError, URLError, TimeoutError):
        raise SyncError("无法读取平台的定版文档，请检查网络和需求链接。") from None

    identity = dict(zip(("projectId", "releaseId", "irId"), query.values()))
    if not isinstance(bundle, dict) or any(bundle.get(key) != value for key, value in identity.items()):
        raise SyncError("下载内容与需求链接不匹配。")
    return bundle


def git(*args, cwd=None):
    try:
        return subprocess.check_output(["git", *args], cwd=cwd, stderr=subprocess.DEVNULL,
                                       encoding="utf-8").strip()
    except (subprocess.CalledProcessError, OSError):
        raise SyncError("请在目标 Git 仓库中检出开发分支并配置远端。") from None


def repository_key(remote):
    scp = re.fullmatch(r"(?:[^@/:]+@)?([^/:]+):(.+)", remote)
    if scp and "://" not in remote:
        host, path = scp.groups()
        port = None
    else:
        url = urlsplit(remote)
        defaults = {"http": 80, "https": 443, "ssh": 22, "git": 9418}
        if not url.hostname or url.scheme not in defaults or url.query or url.fragment:
            return None
        host, path = url.hostname, unquote(url.path)
        port = url.port if url.port != defaults[url.scheme] else None
    return (host.lower(), port, path.strip("/").removesuffix(".git"))


def read_file(root, relative):
    """Read the existing file, rejecting links and non-regular paths."""
    info = None
    path = root
    segments = relative.split("/")
    for index, segment in enumerate(segments):
        path /= segment
        try:
            info = path.lstat()
        except FileNotFoundError:
            return None, None
        if stat.S_ISLNK(info.st_mode) or (
            getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
        ):
            raise SyncError(f"路径包含链接或重解析点：{relative}")
        expected_type = stat.S_ISREG if index == len(segments) - 1 else stat.S_ISDIR
        if not expected_type(info.st_mode):
            raise SyncError(f"文件路径与本地目录冲突：{relative}")
    return path.read_bytes(), stat.S_IMODE(info.st_mode)


@dataclass
class Change:
    relative: str
    content: bytes
    before: bytes | None
    mode: int | None


def plan_changes(root, bundle):
    ir_id = bundle.get("irId")
    sr_ids = bundle.get("srIds")
    files = bundle.get("files")
    if not isinstance(sr_ids, list) or any(not isinstance(sr, str) for sr in sr_ids):
        raise SyncError("定版包的 SR 清单无效。")
    if type(bundle.get("version")) is not int or not isinstance(files, list) or not files:
        raise SyncError("定版包缺少版本或文件。")
    allowed = {("docs", "requirements", ir_id)}
    allowed.update(("openspec", "changes", sr_id) for sr_id in sr_ids)
    changes = []
    seen = set()
    for file in files:
        if not isinstance(file, dict) or not isinstance(file.get("path"), str):
            raise SyncError("定版包包含无效文件路径。")
        relative = file["path"]
        parts = relative.split("/")
        if (
            len(parts) < 4
            or tuple(parts[:3]) not in allowed
            or any(
                not part or part in {".", ".."} or part.lower() == ".git"
                or re.search(r'[\x00-\x1f\x7f<>:"\\|?*]', part)
                or part.endswith((" ", "."))
                or re.fullmatch(r"(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?", part, re.I)
                for part in parts
            )
            or relative.casefold() in seen
        ):
            raise SyncError(f"定版包包含越界、重复或无效的路径：{relative!r}")
        seen.add(relative.casefold())
        if not isinstance(file.get("content"), str):
            raise SyncError(f"文件缺少正文：{relative}")
        content = file["content"].encode("utf-8")
        if len(content) != file.get("size") or hashlib.sha256(content).hexdigest() != file.get("sha256"):
            raise SyncError(f"文件校验失败：{relative}")
        before, mode = read_file(root, relative)
        if before != content:
            changes.append(Change(relative, content, before, mode))
    if any(
        "/".join(path.split("/")[:index]) in seen
        for path in seen
        for index in range(1, len(path.split("/")))
    ):
        raise SyncError("定版包包含文件与目录冲突。")
    return changes


def apply_changes(root, changes, branch, head):
    if git("symbolic-ref", "--quiet", "--short", "HEAD", cwd=root) != branch or (
        git("rev-parse", "--verify", "HEAD", cwd=root) != head
    ):
        raise SyncError("确认期间当前分支或提交发生变化，请重新同步。")
    # 同一工作树内暂存新旧文件，失败时恢复本次已经替换的文件。
    with tempfile.TemporaryDirectory(prefix=".aireq-sync-", dir=root) as staging:
        stage = Path(staging)
        applied = []
        created_dirs = []
        try:
            for index, change in enumerate(changes):
                (stage / f"new-{index}").write_bytes(change.content)
                if change.before is not None:
                    backup = stage / f"old-{index}"
                    backup.write_bytes(change.before)
                    backup.chmod(change.mode)
                    (stage / f"new-{index}").chmod(change.mode)
            for index, change in enumerate(changes):
                if read_file(root, change.relative) != (change.before, change.mode):
                    raise SyncError(f"确认期间本地文件已变化：{change.relative}，请重新同步。")
                target = root / change.relative
                for directory in reversed(target.parents):
                    if directory != root and root in directory.parents and not directory.exists():
                        directory.mkdir()
                        created_dirs.append(directory)
                os.replace(stage / f"new-{index}", target)
                applied.append((index, change, target))
        except (OSError, SyncError):
            failed = []
            for index, change, target in reversed(applied):
                try:
                    if change.before is None:
                        target.unlink()
                    else:
                        os.replace(stage / f"old-{index}", target)
                except OSError:
                    failed.append(change.relative)
            for directory in reversed(created_dirs):
                try:
                    directory.rmdir()
                except OSError:
                    pass
            if failed:
                raise SyncError("部分文件恢复失败，请检查 Git 差异：" + "、".join(failed)) from None
            raise


def main():
    if len(sys.argv) != 2:
        raise SyncError("用法：python document-sync.py <需求链接>")
    root = Path(git("rev-parse", "--show-toplevel")).resolve()
    branch = git("symbolic-ref", "--quiet", "--short", "HEAD", cwd=root)
    head = git("rev-parse", "--verify", "HEAD", cwd=root)
    bundle = download_bundle(sys.argv[1])
    remote = bundle.get("repositoryUrl")
    expected = repository_key(remote) if isinstance(remote, str) else None
    urls = git("config", "--get-regexp", r"^remote\..*\.url$", cwd=root).splitlines()
    if not expected or not any(repository_key(line.split(None, 1)[1]) == expected for line in urls):
        raise SyncError("本地 Git 远端与平台项目仓库不匹配。")
    changes = plan_changes(root, bundle)
    print(f"当前分支 {branch}，定版文档 V{bundle['version']}")
    if not changes:
        print("文档内容已一致。")
        return
    for change in changes:
        print(f"{'新增' if change.before is None else '覆盖'} {change.relative}")
    try:
        confirmed = input("确认写入？[y/N] ").strip().lower() == "y"
    except (EOFError, KeyboardInterrupt):
        confirmed = False
    if not confirmed:
        print("已取消。")
        return
    apply_changes(root, changes, branch, head)
    print(f"已同步 V{bundle['version']} 到 {branch}，共写入 {len(changes)} 个文件。")


if __name__ == "__main__":
    try:
        main()
    except (SyncError, OSError, ValueError) as error:
        print(f"同步失败：{error}", file=sys.stderr)
        sys.exit(1)
