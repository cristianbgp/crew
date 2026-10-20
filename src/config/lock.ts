import { dlopen, FFIType, read } from "bun:ffi";
import { open } from "node:fs/promises";

// Kernel ownership is released even if crew crashes. The file is only an
// anchor, never a claim that another process is alive; do not unlink it.
const libc = dlopen(
  process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6",
  {
    flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    [process.platform === "darwin" ? "__error" : "__errno_location"]: {
      args: [],
      returns: FFIType.ptr,
    },
  },
);
export async function acquireConfigLock(path: string) {
  const file = await open(path + ".lock", "a+", 0o600);
  if (libc.symbols.flock!(file.fd, 2 | 4) !== 0) {
    const pointer =
      libc.symbols[
        process.platform === "darwin" ? "__error" : "__errno_location"
      ]!();
    const errno = pointer ? read.i32(pointer) : 0;
    await file.close();
    if (errno === 35 || errno === 11)
      throw new Error(
        "Configuration is being saved by another crew instance. Try again.",
      );
    throw new Error(
      `Cannot lock configuration (OS error ${errno}). Check file permissions.`,
    );
  }
  return async () => {
    await file.close();
  };
}
