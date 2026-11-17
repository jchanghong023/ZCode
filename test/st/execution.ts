// 只有短业务阶段持锁；服务端等待在锁外，CAS 与断言不被其他测试写入穿插。
let tail: Promise<void> = Promise.resolve();

export function serialSTStep<T>(run: () => Promise<T>): Promise<T> {
  const result = tail.then(run);
  tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
