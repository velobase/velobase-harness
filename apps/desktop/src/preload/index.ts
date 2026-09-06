import { contextBridge, ipcRenderer } from "electron";
import { healthResponseSchema } from "@velobase/contracts";
import { HEALTH_CHANNEL, type DesktopBridge } from "../bridge";

const bridge: DesktopBridge = Object.freeze({
  async getHealth() {
    const response: unknown = await ipcRenderer.invoke(HEALTH_CHANNEL);
    return healthResponseSchema.parse(response);
  },
});

contextBridge.exposeInMainWorld("velobase", bridge);
