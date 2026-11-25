import { ISettingService } from "@zcode/services";
import { WebSettings } from "../../web-settings.js";
import type { MockServiceRegistrar } from "./contract.js";

export function registerSettingsMockServices(services: MockServiceRegistrar): void {
  services.register(ISettingService, new WebSettings());
}
