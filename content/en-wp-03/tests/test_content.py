"""Mutation checks for curriculum invariants and required authored oracle coverage."""

import copy
import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "check_content.py"
SPEC = importlib.util.spec_from_file_location("curriculum_check", MODULE_PATH)
CONTENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONTENT)


class ContentIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.data = copy.deepcopy(CONTENT.load_content())

    def assertViolation(self, fragment):
        self.assertTrue(any(fragment in e for e in CONTENT.validate(self.data)), CONTENT.validate(self.data))

    def test_authored_content_meets_integrity_contract(self):
        self.assertEqual(CONTENT.validate(self.data), [])

    def test_random_inventory_cannot_add_a_twenty_sixth_verb(self):
        self.data["verbs.json"]["verbs"].append(copy.deepcopy(self.data["verbs.json"]["verbs"][0]))
        self.assertViolation("exactly the agreed ordered 25")

    def test_inventory_cannot_silently_replace_an_agreed_verb(self):
        self.data["verbs.json"]["verbs"][-1]["lemma"] = "drive"
        self.assertViolation("exactly the agreed ordered 25")

    def test_burn_and_dream_variants_cannot_be_dropped(self):
        for lemma in ("burn", "dream"):
            with self.subTest(lemma=lemma):
                v = next(v for v in self.data["verbs.json"]["verbs"] if v["lemma"] == lemma)
                v["forms"]["participle"].pop()
                self.assertViolation(f"{lemma}/participle: missing standard alternatives")

    def test_mixed_variant_pair_cannot_be_marked_wrong(self):
        c = next(c for c in self.data["evaluation-fixtures.json"]["cases"] if c["id"] == "forms-burn-burned-burnt")
        c["expected"]["decision"] = "incorrect"
        self.assertViolation("every variant pair")

    def test_spanish_sound_guide_reference_must_resolve(self):
        self.data["verbs.json"]["verbs"][0]["forms"]["base"][0]["sound_guide_refs"] = ["missing"]
        self.assertViolation("Spanish sound guide")

    def test_all_three_sentence_families_are_required(self):
        self.data["verbs.json"]["verbs"][0]["sentence_examples"].pop()
        self.assertViolation("three distinct sentence families")

    def test_perfect_teaching_example_requires_an_auxiliary(self):
        self.data["verbs.json"]["verbs"][14]["sentence_examples"][2]["text"] = "He bought bread."
        self.assertViolation("authored perfect example lacks finite auxiliary")

    def test_both_residence_constructions_need_distinct_explanations(self):
        s = next(s for s in self.data["sentences.json"]["sentences"] if s["id"] == "sentence-since-2020")
        s["accepted_examples"] = [e for e in s["accepted_examples"] if e["tense"] != "present_perfect"]
        self.assertViolation("both since-2020 examples")

    def test_translation_examples_cannot_become_a_closed_whitelist(self):
        self.data["sentences.json"]["sentences"][0]["acceptance_policy"] = "exact-match-only"
        self.assertViolation("exact-answer-only")

    def test_difficulty_axes_must_be_independently_represented(self):
        for s in self.data["sentences.json"]["sentences"]:
            s["difficulty"]["vocabulary"] = s["difficulty"]["grammar"]
        self.assertViolation("vocabulary cannot vary at fixed grammar")
        self.assertViolation("grammar cannot vary at fixed vocabulary")

    def test_uncertain_speech_cannot_be_a_learner_error(self):
        c = next(c for c in self.data["evaluation-fixtures.json"]["cases"] if c["id"] == "uncertain-tense")
        c["expected"]["decision"] = "incorrect"
        self.assertViolation("uncertain speech must clarify")

    def test_uncertain_speech_must_preserve_evidence_and_block_completion(self):
        c = next(c for c in self.data["evaluation-fixtures.json"]["cases"] if c["id"] == "uncertain-negative")
        c["preserve"] = []
        c["never_infer"] = []
        self.assertViolation("missing uncertainty protections")
        self.assertViolation("prior accepted evidence")

    def test_no_spoiler_oracles_cover_indirect_and_pending_leaks(self):
        cases = self.data["evaluation-fixtures.json"]["cases"]
        self.data["evaluation-fixtures.json"]["cases"] = [c for c in cases if c["id"] not in {"hint-encoded-leak", "hint-metalanguage-leak", "hint-pending-no-reveal"}]
        self.assertViolation("hint-encoded-leak")
        self.assertViolation("hint-metalanguage-leak")
        self.assertViolation("hint-pending-no-reveal")

    def test_authored_hints_cannot_be_relabelled_runtime_evidence(self):
        c = next(c for c in self.data["evaluation-fixtures.json"]["cases"] if c["id"] == "hint-full-answer")
        c["input"]["authorship"] = "provider-output"
        self.assertViolation("hint provenance missing")

    def test_dangling_content_and_source_references_are_rejected(self):
        self.data["evaluation-fixtures.json"]["cases"][0]["content_ref"] = "verb-fly"
        self.data["verbs.json"]["verbs"][0]["source_refs"] = ["invented-source"]
        self.assertViolation("dangling fixture content reference")
        self.assertViolation("unknown source reference")

    def test_image_brief_cannot_claim_a_reviewed_asset(self):
        self.data["verbs.json"]["verbs"][0]["image_cue"]["asset_status"] = "licensed"
        self.assertViolation("unreviewed asset status")


if __name__ == "__main__":
    unittest.main()
