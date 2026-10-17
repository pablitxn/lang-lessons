"""Validate authored data and regression coverage, never grade live language/audio."""

import json
import hashlib
import re
from urllib.parse import urlparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VERSION = "en-wp-03/1"
EXACT25 = "be beat become begin bend bet bite bleed blow break bring build burn burst buy catch choose come cost cut deal dig do draw dream".split()
PAST_TENSES = {"past_simple", "past_continuous", "past_perfect", "past_perfect_continuous"}
TENSES = {"present_simple", "present_continuous", "present_perfect", "present_perfect_continuous"} | PAST_TENSES
FILES = ("verbs.json", "sentences.json", "evaluation-fixtures.json", "hint-policy.json", "asset-ledger.json")


def load_content(root=ROOT):
    return {name: json.loads((root / name).read_text()) for name in FILES}


def validate(bundle):
    """Return content-integrity errors; no semantic or acoustic scoring is implied."""
    errors = []

    def require(condition, message):
        if not condition:
            errors.append(message)

    for name in FILES:
        expected_version = "en-wp-03/assets/2" if name == "asset-ledger.json" else VERSION
        require(bundle[name].get("schema_version") == expected_version, f"{name}: unsupported schema version")
        require(bundle[name].get("authorship") == "curated-real-photographs" if name == "asset-ledger.json" else bundle[name].get("authorship", "").startswith("authored-"), f"{name}: missing authored provenance")
    verbs = bundle["verbs.json"]["verbs"]
    sentences = bundle["sentences.json"]["sentences"]
    cases = bundle["evaluation-fixtures.json"]["cases"]
    require([v["lemma"] for v in verbs] == EXACT25, "inventory must be exactly the agreed ordered 25 verbs")
    require([v["inventory_order"] for v in verbs] == list(range(1, 26)), "inventory order must be 1..25")
    ids = [v["id"] for v in verbs] + [s["id"] for s in sentences]
    require(len(ids) == len(set(ids)), "content IDs must be unique")
    require(len(cases) == len({c["id"] for c in cases}), "fixture IDs must be unique")
    refs = set(ids)
    guides = bundle["verbs.json"]["sound_guides_es"]
    source_ids = set(re.findall(r"^\| ([a-z][a-z0-9-]+) \|", (ROOT / "SOURCES.md").read_text(), re.M))
    for record in verbs + sentences:
        require(bool(record["source_refs"]), f"{record['id']}: needs source provenance")
        require(set(record["source_refs"]) <= source_ids, f"{record['id']}: unknown source reference")
    for v in verbs:
        vid = v["id"]
        require(vid == "verb-" + v["lemma"], f"{vid}: unstable lemma ID")
        require(bool(v["meanings_es"]) and bool(v["cue_sense"]), f"{vid}: missing meaning/sense")
        require(set(v["forms"]) == {"base", "past", "participle"}, f"{vid}: missing form families")
        for role, variants in v["forms"].items():
            words = [f["text"] for f in variants]
            require(bool(words) and len(words) == len(set(words)), f"{vid}/{role}: empty or duplicate variants")
            for form in variants:
                require(bool(re.fullmatch(r"[a-z]+", form["text"])), f"{vid}: form must be one spelling")
                require(bool(re.fullmatch(r"/[^/]+/", form["ipa"])), f"{vid}: invalid reference IPA container")
                require(isinstance(form.get("sound_spelling_es"), str) and bool(form["sound_spelling_es"].strip()), f"{vid}: missing Spanish sound spelling")
                require(bool(form["sound_guide_refs"]) and set(form["sound_guide_refs"]) <= set(guides), f"{vid}: missing/dangling Spanish sound guide")
                require(bool(form["sound_note_es"]), f"{vid}: missing Spanish sound note")
        examples = v["sentence_examples"]
        tense_examples = v.get("tense_examples", [])
        expected_tenses = {"past_simple", "past_perfect"} if v["lemma"] == "be" else PAST_TENSES
        require({e["tense"] for e in tense_examples} == expected_tenses, f"{vid}: missing contextual past-tense examples")
        families = {"past_simple": "past", "past_continuous": "base", "past_perfect": "participle", "past_perfect_continuous": "base"}
        for example in tense_examples:
            require(example.get("family") == families.get(example["tense"]), f"{vid}: tense example cannot certify the wrong form family")
            require(bool(example.get("text")) and bool(example.get("explanation")), f"{vid}: incomplete tense example")
        require(sorted(e["family"] for e in examples) == ["base", "participle", "past"], f"{vid}: needs three distinct sentence families")
        require(all(e["text"].endswith(".") and e["construction"] for e in examples), f"{vid}: missing sentence/construction")
        # Check the specifically authored perfect examples have a finite auxiliary.
        # This is not a universal participle grammar rule: passive fixtures also pass.
        for ex in examples:
            if ex["family"] == "participle":
                require(bool(re.search(r"\b(?:has|have)\b", ex["text"])), f"{vid}: authored perfect example lacks finite auxiliary")
        cue = v["image_cue"]
        require(cue["asset_status"] == "reviewed-real-photograph", f"{vid}: unreviewed asset status")
        require(bool(re.fullmatch(r"public/images/verbs/" + re.escape(v["lemma"]) + r"-[0-9]+\.jpg", cue["file"])) and cue["src"] == "/" + cue["file"].removeprefix("public/"), f"{vid}: missing or invalid local asset reference")
        require(bool(cue["nonvisual_cue_es"]) and bool(cue["context_es"]) and type(cue["ambiguous"]) is bool, f"{vid}: missing nonvisual/context/ambiguity cue")
        require(bool(cue["brief"]) and bool(cue["alt"]) and bool(cue["avoid"]), f"{vid}: incomplete cue brief")
    assets = bundle["asset-ledger.json"]["assets"]
    require({a["content_id"] for a in assets} == {"verb-" + lemma for lemma in EXACT25}, "asset ledger must cover exactly25 verbs with one or more photos each")
    require(len({a["asset_id"] for a in assets}) == len(assets), "duplicate photo ID")
    require(len({a["sha256"] for a in assets}) == len(assets), "each photo must have distinct bytes")
    asset_dir = ROOT.parents[1] / "public/images/verbs"
    require(sorted(p.name for p in asset_dir.iterdir() if p.is_file()) == sorted(Path(a["file"]).name for a in assets), "asset files must match the photo ledger; generated assets forbidden")
    for asset in assets:
        validate_asset(asset, ROOT.parents[1], require)
    for verb in verbs:
        primary = next((a for a in assets if a["content_id"] == verb["id"]), None)
        cue = verb["image_cue"]
        require(primary is not None and all(cue.get(k) == primary.get(k) for k in ["src", "file", "creator", "attribution", "nonvisual_cue_es", "context_es", "ambiguous"]), f"{verb['id']}: primary photo metadata diverged")
    for lemma, required in {"burn": {"burned", "burnt"}, "dream": {"dreamed", "dreamt"}}.items():
        v = next((v for v in verbs if v["lemma"] == lemma), None)
        for role in ("past", "participle"):
            require(v is not None and {f["text"] for f in v["forms"][role]} == required, f"{lemma}/{role}: missing standard alternatives")
        pairs = {(c["input"]["past"], c["input"]["participle"]) for c in cases if c["id"].startswith("forms-" + lemma + "-") and c["expected"]["decision"] == "accept"}
        require(pairs == {(a, b) for a in required for b in required}, f"{lemma}: fixture coverage must accept every variant pair")
    require(set(bundle["sentences.json"]["scope"]) == TENSES, "sentence scope must contain all eight present/past tenses")
    require({s["primary_tense"] for s in sentences} == TENSES, "all eight primary tenses need content")
    for s in sentences:
        sid = s["id"]
        require(s["acceptance_policy"] == "semantic-open-set", f"{sid}: exact-answer-only policy forbidden")
        require(bool(s["prompt_es"]) and bool(s["context_es"]), f"{sid}: missing sentence or authoring context")
        require(set(s["difficulty"]) == {"grammar", "vocabulary"}, f"{sid}: difficulty dimensions must be separate")
        require(all(type(x) is int and 1 <= x <= 3 for x in s["difficulty"].values()), f"{sid}: difficulty must use local levels 1..3")
        require(len(s["post_acceptance"]) == 3 and bool(s["meaning_requirements"]), f"{sid}: missing explanation obligations")
        require(len(s["hint_intents"]) == 3, f"{sid}: progressive semantic hint intents missing")
        for example in s["accepted_examples"]:
            require(all(example.get(k) for k in ["text", "tense", "structure", "meaning"]), f"{sid}: incomplete accepted example")
            require(example["tense"] in TENSES, f"{sid}: unsupported example tense")
    # Demonstrate both independent authoring axes inside every tense.
    for tense in TENSES:
        cells = {(s["difficulty"]["grammar"], s["difficulty"]["vocabulary"]) for s in sentences if s["primary_tense"] == tense}
        require(any(g1 == g2 and v1 != v2 for g1, v1 in cells for g2, v2 in cells), f"{tense}: vocabulary cannot vary at fixed grammar")
        require(any(g1 != g2 and v1 == v2 for g1, v1 in cells for g2, v2 in cells), f"{tense}: grammar cannot vary at fixed vocabulary")
        if tense in PAST_TENSES:
            forms = {s.get("sentence_form") for s in sentences if s["primary_tense"] == tense}
            require({"affirmative", "negative", "question"} <= forms, f"{tense}: affirmative, negative and question coverage required")
    since = next((s for s in sentences if s["id"] == "sentence-since-2020"), None)
    live_examples = {
        "We have lived here since 2020.": "present_perfect",
        "We have been living here since 2020.": "present_perfect_continuous",
    }
    require(since is not None and all(any(e["text"] == text and e["tense"] == tense for e in since["accepted_examples"]) for text, tense in live_examples.items()), "both since-2020 examples need the correct contextual tense explanation")
    decisions = {"accept", "incorrect", "incomplete", "clarify", "ignore", "allow", "block"}
    for c in cases:
        require(c["content_ref"] in refs, f"{c['id']}: dangling fixture content reference")
        require(c["expected"]["decision"] in decisions and bool(c["expected"]["reason"]), f"{c['id']}: incomplete expected result")
        if c["area"] == "speech" and c["input"].get("recognition") == "uncertain":
            require(c["expected"]["decision"] == "clarify", f"{c['id']}: uncertain speech must clarify")
            require({"learner_error", "success", "new_help_eligibility", "completion"} <= set(c.get("never_infer", [])), f"{c['id']}: missing uncertainty protections")
            require("accepted_evidence" in c.get("preserve", []), f"{c['id']}: prior accepted evidence must survive")
        if c["area"] == "hint":
            require(c["input"].get("authorship") == "authored-adversarial-fixture", f"{c['id']}: hint provenance missing")
    # Coverage assertions identify required oracle examples, not a runtime model pass.
    by_case = {c["id"]: c for c in cases}
    required_oracles = {
        "buy-base-agreement": "accept", "bare-pp": "incorrect", "missing-auxiliary": "incorrect",
        "perfect-pp": "accept", "passive-pp": "accept", "cost-other-sense": "clarify",
        "adjective-ambiguity": "clarify", "open-set-synonym": "accept", "connected-speech-clear": "accept",
        "explanation-wrong-tense": "incorrect", "explanation-missing-meaning": "incomplete",
        "pronunciation-not-spelling": "clarify", "stale-evidence": "ignore", "image-not-tense": "incorrect",
        "hint-semantic-safe": "allow", "hint-retry-safe": "allow", "post-acceptance-teaching": "allow",
        "hint-tense-leak": "block", "hint-english-tense-leak": "block", "hint-full-answer": "block",
        "hint-contracted-answer": "block", "hint-prefix-leak": "block", "hint-blank-leak": "block",
        "hint-metalanguage-leak": "block", "hint-suffix-shortcut": "block", "hint-ongoing-shortcut": "block",
        "hint-encoded-leak": "block", "hint-pending-no-reveal": "block",
        "past-did-base": "incorrect", "past-was-ing": "incorrect", "past-had-participle": "incorrect",
        "past-had-been-ing": "incorrect", "past-reference-fit": "incorrect",
    }
    for cid, decision in required_oracles.items():
        require(cid in by_case and by_case[cid]["expected"]["decision"] == decision, f"{cid}: missing or changed required oracle")
    for text, tense in live_examples.items():
        require(any(c["area"] == "translation" and c["input"].get("text") == text and c["expected"]["decision"] == "accept" and c.get("expected_tense") == tense and c.get("explanation_required") for c in cases), f"{tense}: live example needs acceptance plus explanation fixture")
    policy = bundle["hint-policy.json"]
    require(policy["runtime_hint_origin"] == "model-generated-per-attempt", "runtime hints must remain separate from authored fixtures")
    require(policy["uncertainty"] == {"action": "neutral clarification", "count_as_error": False, "increase_hint_level": False, "enable_error_help": False}, "hint policy cannot escalate uncertainty to learner error")
    require({"translation_pending", "translation_processing", "translation_uncertain", "translation_incorrect"} <= set(policy["pre_acceptance_stages"]), "no-spoiler boundary must cover all pre-acceptance stages")
    require([p["level"] for p in policy["progression"]] == [1, 2, 3], "hint progression must contain three bounded levels")
    return errors


def validate_asset(asset, repo_root, require):
    """Check photo declarations, local JPEG bytes and provenance; not an AI detector."""
    label = asset["content_id"]
    relative = asset["file"]
    if not re.fullmatch(r"public/images/verbs/[a-z]+-[0-9]+\.jpg", relative):
        require(False, f"{label}: unsafe photograph file path")
        return
    path = repo_root / relative
    if not path.is_file():
        require(False, f"{label}: photograph file missing")
        return
    raw = path.read_bytes()
    require(hashlib.sha256(raw).hexdigest() == asset["sha256"], f"{label}: photograph checksum mismatch")
    require(raw.startswith(b"\xff\xd8\xff") and raw.endswith(b"\xff\xd9"), f"{label}: invalid JPEG signature")
    require(0 < len(raw) <= 500_000, f"{label}: photo exceeds the 500 KB budget")
    require(asset.get("media_type") == "photograph" and asset.get("review_status") == "source-and-visual-reviewed", f"{label}: only reviewed real photographs are allowed")
    for key in ["creator", "provider", "license", "rights_basis", "attribution", "reviewed_on", "transformations", "nonvisual_cue_es", "context_es"]:
        require(bool(asset.get(key)), f"{label}: missing photograph provenance {key}")
    for key in ["source_url", "download_url", "license_url"]:
        url = urlparse(asset.get(key, ""))
        require(url.scheme == "https" and bool(url.netloc), f"{label}: missing HTTPS provenance {key}")
    require(asset.get("src") == "/" + relative.removeprefix("public/"), f"{label}: photograph source mismatch")


if __name__ == "__main__":
    data = load_content()
    failures = validate(data)
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"Content integrity passed: {len(data['verbs.json']['verbs'])} verbs, "
          f"{len(data['sentences.json']['sentences'])} prompts, "
          f"{len(data['evaluation-fixtures.json']['cases'])} authored oracle cases.")
    print("This integrity command performs no runtime grammar, hint-model, speech, browser or provider evaluation.")
