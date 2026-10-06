// Production lot integration tests commit for real, so they only ever run
// against a dedicated test database (default cps_db_test, a copy of the dev
// DB — see admin-dashboard AGENTS.md). Set before AppModule is loaded so the
// TypeORM config picks it up (env vars win over .env).
process.env.DB_DATABASE = process.env.PRODUCTION_TEST_DB ?? 'cps_db_test';
// The suite also exercises the unscanned ways of recording production, which
// are switched off in normal runs (see ProcessService.produce).
process.env.PRODUCTION_REQUIRE_BOX_SCAN = 'false';
