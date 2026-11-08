"""Tracker-board interval regressions, including calendar edges and legacy rows."""
import ast
import calendar
import datetime
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
file = ROOT / "app" / "app_part2.py"
tree = ast.parse(file.read_text(encoding="utf-8"), filename=str(file))
NAMES = {
    "tracker_period_choice", "tracker_period_anchor",
    "tracker_month_offset", "tracker_window",
}
definitions = [node for node in tree.body
               if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
               and node.name in NAMES]
assert len(definitions) == len(NAMES), "Missing tracker schedule functions"
subset = ast.Module(body=definitions, type_ignores=[])
namespace = {
    "date": datetime.date, "timedelta": datetime.timedelta,
    "TRACKER_MONTH_NAMES": ("janvier","février","mars","avril","mai","juin",
                            "juillet","août","septembre","octobre","novembre","décembre"),
    "TRACKER_PERIOD_LIMITS": {"days":90,"weeks":12,"months":24,"years":5},
}
exec(compile(subset, str(file), "exec"), namespace)


def window(unit, count, anchor, shift=0, today=datetime.date(2026, 10, 28)):
    return namespace["tracker_window"]({
        "period_unit":unit, "period_count":count, "anchor_date":anchor
    }, shift, today)


class PeriodTests(unittest.TestCase):
    def test_iso_week_53_then_week_1_and_fortnight_heading(self):
        last=window('weeks',1,'2020-12-28',today=datetime.date(2021,1,1))
        first=window('weeks',1,'2020-12-28',today=datetime.date(2021,1,4))
        pair=window('weeks',2,'2020-12-28',today=datetime.date(2021,1,1))
        self.assertEqual(last['heading'],'sem 53')
        self.assertEqual(first['heading'],'sem 1')
        self.assertEqual(pair['heading'],'sem 53–1 · 2020–2021')

    def test_annual_cleaning_schedules_have_12_4_2_or_1_cells(self):
        for unit,count in [('month',12),('quarter',4),('semester',2),('year',1)]:
            p=namespace['tracker_window']({'period_unit':'years','period_count':1,'anchor_date':'2026-01-01','mark_unit':unit},today=datetime.date(2026,11,9))
            self.assertEqual(len(p['columns']),count)
            self.assertEqual(p['columns'][0]['day'],'2026-01-01')
        p=namespace['tracker_window']({'period_unit':'years','period_count':1,'anchor_date':'2026-01-01','mark_unit':'quarter'},today=datetime.date(2026,11,9))
        self.assertEqual([c['label'] for c in p['columns']],['T1','T2','T3','T4'])

    def test_old_monthly_board_stays_calendar_month(self):
        p = window("months",1,"2000-01-01")
        self.assertEqual((p["start"],p["end"]), ("2026-10-01","2026-10-31"))
        self.assertEqual(len(p["columns"]),31)
        self.assertEqual(window("months",1,"2000-01-01",1)["start"],"2026-11-01")
        self.assertEqual(window("months",1,"2000-01-01",-1)["start"],"2026-09-01")

    def test_two_week_board_monday_to_sunday(self):
        p=window("weeks",2,"2026-10-26")
        self.assertEqual((p["start"],p["end"]),("2026-10-26","2026-11-08"))
        self.assertEqual(len(p["columns"]),14)
        self.assertEqual(window("weeks",2,"2026-10-26",1)["start"],"2026-11-09")
        self.assertEqual(window("weeks",2,"2026-10-26",-1)["end"],"2026-10-25")

    def test_two_month_board_crosses_year(self):
        p=window("months",2,"2026-10-01",1)
        self.assertEqual((p["start"],p["end"]),("2026-12-01","2027-01-31"))
        self.assertEqual(len(p["columns"]),62)
        self.assertEqual(window("months",2,"2026-10-01",2)["start"],"2027-02-01")

    def test_yearly_and_two_year_views_are_monthly(self):
        yearly=window("years",1,"2026-01-01")
        self.assertEqual((yearly["start"],yearly["end"]),("2026-01-01","2026-12-31"))
        self.assertEqual(len(yearly["columns"]),12)
        self.assertEqual(yearly["columns"][9]["day"],"2026-10-01")
        next_year=window("years",1,"2026-01-01",1)
        self.assertEqual(next_year["start"],"2027-01-01")
        two=window("years",2,"2026-01-01")
        self.assertEqual(len(two["columns"]),24)
        self.assertEqual(two["end"],"2027-12-31")

    def test_leap_year_and_february_short_month(self):
        p=window("months",2,"2024-01-01",today=datetime.date(2024,2,29))
        self.assertEqual(p["end"],"2024-02-29")
        self.assertEqual(len(p["columns"]),60)
        prev=window("months",1,"2000-01-01",today=datetime.date(2025,2,14))
        self.assertEqual(len(prev["columns"]),28)

    def test_custom_ten_days_and_six_months(self):
        p=window("days",10,"2026-10-25")
        self.assertEqual((p["start"],p["end"]),("2026-10-25","2026-11-03"))
        self.assertEqual(len(p["columns"]),10)
        p2=window("months",6,"2026-10-01")
        self.assertEqual((p2["start"],p2["end"]),("2026-10-01","2027-03-31"))
        self.assertEqual(len(p2["columns"]),6)

    def test_out_of_range_rejected(self):
        choose=namespace["tracker_period_choice"]
        for unit,count in [("weeks",13),("months",25),("years",6),("days",91),
                           ("unknown",1),("weeks",0),("months",-1)]:
            with self.subTest(unit=unit,count=count),self.assertRaises(ValueError):
                choose(unit,count)
        for offset in (-61,61,True,0.5,"1"):
            with self.subTest(offset=offset),self.assertRaises(ValueError):
                window("weeks",2,"2026-10-26",offset)


if __name__=="__main__":
    unittest.main()
