// Sample runner outputs. BUN_GREEN_REAL and PYTEST_GREEN_REAL were captured
// from real runs on 2026-10-15 (two private projects); the rest follow each
// runner's documented output format.

export const BUN_GREEN_REAL = `bun test v1.4.2 (50a8a8387)

 1 pass
 0 fail
 1 expect() calls
Ran 1 test across 1 file. [257.00ms]`

export const BUN_GREEN = `bun test v1.4.2 (50a8a8387)

test/smoke.test.ts:
✓ smoke > boots [1.20ms]
test/router.test.ts:
✓ router > routes /health [0.40ms]

 120 pass
 0 fail
 311 expect() calls
Ran 120 tests across 14 files. [12.34s]`

export const BUN_RED = `bun test v1.4.2 (50a8a8387)

test/router.test.ts:
✓ router > routes /health [0.40ms]
(fail) router > rejects bad token [2.10ms]
error: expect(received).toBe(expected)
(fail) router > handles 404 [0.90ms]
✗ store > persists run [5.00ms]

 117 pass
 3 fail
 300 expect() calls
Ran 120 tests across 14 files. [11.02s]`

export const BUN_SKIP = `bun test v1.4.2 (50a8a8387)

test/router.test.ts:
(skip) router > slow integration

 117 pass
 3 skip
 0 fail
 290 expect() calls
Ran 120 tests across 14 files. [10.50s]`

export const BUN_ANSI = '\u001b[0m\u001b[2mbun test \u001b[0mv1.4.2\n\n\u001b[31m(fail)\u001b[0m smoke > boots \u001b[2m[1.00ms]\u001b[0m\n\n\u001b[32m 4 pass\u001b[0m\n\u001b[31m 1 fail\u001b[0m\nRan 5 tests across 1 file. \u001b[2m[30.00ms]\u001b[0m'

export const PYTEST_GREEN_REAL = `........................................................................ [ 74%]
.........................                                                [100%]
97 passed in 97.64s (0:01:37)`

export const PYTEST_GREEN = `============================= test session starts ==============================
platform darwin -- Python 3.12.4, pytest-8.3.2, pluggy-1.5.0
rootdir: /Users/x/notes-hub
collected 97 items

tests/test_store.py ...................................................  [ 52%]
tests/test_graph.py ..............................................       [100%]

============================== 97 passed in 3.21s ==============================`

export const PYTEST_RED = `============================= test session starts ==============================
collected 97 items

tests/test_store.py ..F.......E...........                               [100%]

=================================== FAILURES ===================================
____________________________ test_upsert_dedupes ______________________________
E       assert 2 == 1
=========================== short test summary info ============================
FAILED tests/test_store.py::test_upsert_dedupes - assert 2 == 1
FAILED tests/test_store.py::TestLinks::test_backlink - KeyError: 'x'
ERROR tests/test_store.py::test_db_fixture - sqlite3.OperationalError
=================== 2 failed, 94 passed, 1 error in 4.02s ====================`

export const PYTEST_SKIP = `tests/test_store.py ..s.s...x.....                                       [100%]
=========================== short test summary info ============================
SKIPPED [1] tests/test_store.py:40: needs network
====== 90 passed, 5 skipped, 2 xfailed, 3 warnings in 2.50s ======`

export const VITEST_GREEN = ` RUN  v2.1.4 /Users/x/web

 ✓ src/utils.test.ts (12 tests) 8ms
 ✓ src/api.test.ts (30 tests) 41ms

 Test Files  2 passed (2)
      Tests  42 passed (42)
   Start at  10:12:01
   Duration  1.24s (transform 80ms, setup 0ms, collect 120ms, tests 49ms)`

export const VITEST_RED = ` RUN  v2.1.4 /Users/x/web

 ❯ src/api.test.ts (30 tests | 2 failed) 41ms
   × api > returns 401 without token 5ms
   × api > paginates 3ms
 ✓ src/utils.test.ts (12 tests) 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/api.test.ts > api > returns 401 without token
AssertionError: expected 200 to be 401
 FAIL  src/api.test.ts > api > paginates
AssertionError: expected [] to have length 10

 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 40 passed (42)
   Duration  1.31s`

export const VITEST_SKIP = ` ✓ src/api.test.ts (30 tests | 3 skipped) 41ms

 Test Files  2 passed (2)
      Tests  39 passed | 3 skipped (42)
   Duration  980ms`

export const JEST_GREEN = `PASS src/math.test.js
  math
    ✓ adds (2 ms)
    ✓ subtracts

Test Suites: 3 passed, 3 total
Tests:       25 passed, 25 total
Snapshots:   0 total
Time:        1.532 s
Ran all test suites.`

export const JEST_RED = `FAIL src/math.test.js
  math
    ✓ adds (2 ms)
    ✕ divides by zero (4 ms)
    ✕ rounds half up (1 ms)

  ● math › divides by zero

Test Suites: 1 failed, 2 passed, 3 total
Tests:       2 failed, 23 passed, 25 total
Snapshots:   0 total
Time:        2.01 s`

export const JEST_SKIP = `PASS src/math.test.js
Test Suites: 3 passed, 3 total
Tests:       4 skipped, 1 todo, 20 passed, 25 total
Time:        1.1 s`

export const CARGO_GREEN = `   Compiling pulse v0.1.0 (/Users/x/pulse)
    Finished \`test\` profile [unoptimized + debuginfo] target(s) in 1.20s
     Running unittests src/lib.rs (target/debug/deps/pulse-1a2b)

running 12 tests
............
test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s

   Doc-tests pulse

running 2 tests
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.30s`

export const CARGO_RED = `running 12 tests
test parse::tests::empty ... ok
test parse::tests::unicode ... FAILED
test store::tests::roundtrip ... FAILED

failures:

---- parse::tests::unicode stdout ----
thread 'parse::tests::unicode' panicked at src/parse.rs:40:9

---- store::tests::roundtrip stdout ----
thread 'store::tests::roundtrip' panicked

failures:
    parse::tests::unicode
    store::tests::roundtrip

test result: FAILED. 10 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s

error: test failed, to rerun pass \`--lib\``

export const CARGO_SKIP = `running 12 tests
test result: ok. 9 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out; finished in 0.01s`

export const GO_GREEN = `ok  	github.com/x/pulse/parse	0.012s
ok  	github.com/x/pulse/store	(cached)
?   	github.com/x/pulse/cmd	[no test files]`

export const GO_RED = `--- FAIL: TestParseUnicode (0.00s)
    parse_test.go:40: got "?" want "é"
--- FAIL: TestStore (0.01s)
    --- FAIL: TestStore/roundtrip (0.00s)
FAIL
FAIL	github.com/x/pulse/parse	0.015s
ok  	github.com/x/pulse/store	0.020s
FAIL`

export const GO_SKIP = `=== RUN   TestA
--- PASS: TestA (0.00s)
=== RUN   TestB
--- SKIP: TestB (0.00s)
    b_test.go:10: needs docker
=== RUN   TestC
--- PASS: TestC (0.00s)
PASS
ok  	github.com/x/pulse/parse	0.010s`

export const NOT_TESTS = `total 24
drwxr-xr-x  5 x staff  160 Oct 15 10:00 .
-rw-r--r--  1 x staff  812 Oct 15 10:00 README.md`
