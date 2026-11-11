# Working rules

Decisions made with the user while building these drills. They apply to every skill and every change here.

## Content

- **Hints never reveal the answer.** A grey `<c>(…)</c>` hint in a Persian sentence may only say what *not* to
  use (`نه <en>pain</en>`) or give neutral context. It never names the target word, its word family, its first
  letter or anything pointing at it ("با <en>about</en>", "اسمِ هم‌خانوادهٔ …" are forbidden). Explanations
  that give the answer away go in `note`, which shows only after the answer.
  *Why:* «توی راهنما نباید خبری از کلمه‌ای که باید توی جمله انگلیسی گفته بشه باشه… چیزی که باید باهاش گفته
  بشه رو من باید حدس بزنم» (2026-10-05). The drill is active recall.
- **Full table coverage (IELTS Up Words).** Every word in both tables of a lesson, every item of the "other
  structures" column and every Speaking-Tip-only word is the answer to at least one unit, using invented
  sentences in «تمرین تکمیلی» where the main text lacks it. Nothing is skipped.
  *Why:* the PDFs are not read any more; anything left out of the drill is never learned.
- **One exercise per session**, and **a sample before bulk**: when many exercises or files of one kind are to
  be generated, make one and wait for approval before the rest.

## Reading aloud

- **English only.** Never read the Persian sentences aloud, in auto mode or anywhere else.
  *Why:* «ignore speak persian forever — current persian voices are not good» (2026-11-10).

## Structure

- This project replaced `lingemy-exercise`, `teded-exercise` and `grammar-exercise` on 2026-11-11. Those are
  archives now; new exercises go here.
- An exercise is a data file in `data/`; the engine is `app/drill.html` and is shared. There are no per-lesson
  HTML files and no templates to keep in sync.
- `scripts/import.py` re-imports from the old projects and **overwrites** `data/`. Never run it after
  exercises were edited here.
- The audio / video makers and the Anki summary tool stayed in `lingemy-exercise/tools`.
