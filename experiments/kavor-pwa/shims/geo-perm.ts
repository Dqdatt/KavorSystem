/* Khắc phục lỗi quyền vị trí trên iOS PWA: mỗi lần mở lại web app,
   navigator.permissions.query({ name: "geolocation" }) luôn trả "prompt" dù quyền vị trí đã cấp
   và getCurrentPosition vẫn lấy được ngay. Shim này lưu cờ khi lấy vị trí thành công để query trả "granted". */

export const KEY = "kavor-pwa:locOk";

const PATCHED_KEY = "__kavor_geo_patched__";

export function patchGeoPermission(
  nav: Navigator,
  store: Pick<Storage, "getItem" | "setItem" | "removeItem">
): void {
  if (!nav || !nav.geolocation) return;

  const geo = nav.geolocation as unknown as Record<string, unknown>;
  if (geo[PATCHED_KEY]) return;
  geo[PATCHED_KEY] = true;

  const getOk = (): boolean => {
    try {
      return store.getItem(KEY) === "1";
    } catch {
      return false;
    }
  };

  const setOk = (): void => {
    try {
      store.setItem(KEY, "1");
    } catch {
      // Bỏ qua lỗi localStorage (chế độ riêng tư/bị chặn)
    }
  };

  const removeOk = (): void => {
    try {
      store.removeItem(KEY);
    } catch {
      // Bỏ qua lỗi localStorage
    }
  };

  const origGetCurrentPosition = nav.geolocation.getCurrentPosition.bind(nav.geolocation);
  nav.geolocation.getCurrentPosition = function (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions
  ): void {
    return origGetCurrentPosition(
      (pos: GeolocationPosition) => {
        setOk();
        successCallback(pos);
      },
      (err: GeolocationPositionError) => {
        if (err.code === 1) {
          removeOk();
        }
        errorCallback?.(err);
      },
      options
    );
  };

  const origWatchPosition = nav.geolocation.watchPosition.bind(nav.geolocation);
  nav.geolocation.watchPosition = function (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions
  ): number {
    return origWatchPosition(
      (pos: GeolocationPosition) => {
        setOk();
        successCallback(pos);
      },
      (err: GeolocationPositionError) => {
        if (err.code === 1) {
          removeOk();
        }
        errorCallback?.(err);
      },
      options
    );
  };

  if (nav.permissions && typeof nav.permissions.query === "function") {
    const origQuery = nav.permissions.query.bind(nav.permissions);
    nav.permissions.query = async function (desc: PermissionDescriptor): Promise<PermissionStatus> {
      const res = await origQuery(desc);
      if (desc && (desc as unknown as { name?: string }).name === "geolocation") {
        if (res && res.state === "prompt" && getOk()) {
          return { state: "granted", name: "geolocation" } as PermissionStatus;
        }
      }
      return res;
    };
  }
}

if (typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.geolocation) {
  try {
    patchGeoPermission(navigator, window.localStorage);
  } catch {
    // Bỏ qua nếu truy cập window.localStorage ném lỗi
  }
}
