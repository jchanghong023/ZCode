import { createRoot } from "react-dom/client";
import {
  PlatformProvider,
  ServiceProvider,
  TabStoreProvider,
  TooltipProvider,
  ZCodeIntlProvider,
  getDisconnectedRemoteServices,
} from "@zcode/ui/web-chat-view";
import { createWebPlatform } from "../platform/index.js";
import { ChatApp } from "./ChatApp.js";
import "./styles.css";

document.documentElement.classList.add("dark", "theme-zai-dark");
createRoot(document.getElementById("root")!).render(
  <PlatformProvider platform={createWebPlatform()}>
    <TabStoreProvider>
      <ZCodeIntlProvider>
        {/* 原生渲染器会查找宿主能力；独立页无法使用的能力沿用断开服务端口。 */}
        <ServiceProvider services={getDisconnectedRemoteServices()}>
          <TooltipProvider>
            <ChatApp />
          </TooltipProvider>
        </ServiceProvider>
      </ZCodeIntlProvider>
    </TabStoreProvider>
  </PlatformProvider>,
);
