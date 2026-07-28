import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;

  // Nullable rather than defaulted: NULL means "this project has never set an
  // override", which is what the resolver treats as "inherit global settings".
  if (!columns.some((column) => column.name === "preferences_json")) {
    yield* sql`
      ALTER TABLE projection_projects
      ADD COLUMN preferences_json TEXT
    `;
  }
});
