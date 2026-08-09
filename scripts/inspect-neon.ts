import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL unset");
  const sql = neon(url);
  const tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by 1
  `;
  console.log("tables:", tables);

  const cols = await sql`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'bump_intents'
    order by ordinal_position
  `;
  console.log("bump_intents columns:", cols);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
