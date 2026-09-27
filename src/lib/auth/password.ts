// argon2id, paramètres OWASP (19 MiB, 2 itérations)
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

// Android : pas de module natif, argon2id en WebAssembly (même format de hachage)
const wasm = () => process.env.ZE_PLATFORM === "android";

export async function hashPassword(password: string) {
  if (wasm()) {
    const { argon2id } = await import("hash-wasm");
    const { randomBytes } = await import("node:crypto");
    return argon2id({
      password,
      salt: randomBytes(16),
      memorySize: OPTS.memoryCost,
      iterations: OPTS.timeCost,
      parallelism: OPTS.parallelism,
      hashLength: 32,
      outputType: "encoded",
    });
  }
  return (await import("@node-rs/argon2")).hash(password, OPTS);
}

export async function verifyPassword(hashed: string, password: string) {
  try {
    if (wasm()) return await (await import("hash-wasm")).argon2Verify({ password, hash: hashed });
    return await (await import("@node-rs/argon2")).verify(hashed, password);
  } catch {
    return false;
  }
}
