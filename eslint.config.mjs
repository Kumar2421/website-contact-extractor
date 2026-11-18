import next from "eslint-config-next";

const config = [...next, { ignores: [".next/**", "node_modules/**", "actor/**", "scripts/out/**", "lib/database.types.ts"] }];
export default config;
