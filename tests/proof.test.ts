import test from "node:test";
import assert from "node:assert/strict";
import { investorEvidence } from "../lib/proof.ts";

const press =
  "Avatar Robotics raised a $6.5M Seed round led by AlleyCorp, with participation from Headline, Java Capital. The company is based in San Francisco.";

test("lead and participants named in the funding sentence pass", () => {
  assert.ok(investorEvidence(press, "AlleyCorp"));
  assert.ok(investorEvidence(press, "Headline"));
  assert.ok(investorEvidence(press, "Java Capital"));
});

test("firm suffix is optional on the page", () => {
  assert.ok(investorEvidence("Scooter raised $180K led by AJVC.", "AJVC Ventures"));
});

test("a lowercase common word is not an investor", () => {
  assert.equal(investorEvidence("Read the latest headline about robot news. The funding round-up is weekly.", "Headline"), null);
});

test("a mention in a different sentence from the funding language is rejected", () => {
  assert.equal(
    investorEvidence("Antler is based in Singapore and hosts events. Meanwhile the startup raised $2M from angels.", "Antler"),
    null
  );
});

test("earlier-round mentions are rejected", () => {
  assert.equal(investorEvidence("Antler previously backed the founders in an earlier programme.", "Antler"), null);
});

test("whole-word only: Base does not match Base10", () => {
  assert.equal(investorEvidence("The round was led by Base10 Partners.", "Base"), null);
});
