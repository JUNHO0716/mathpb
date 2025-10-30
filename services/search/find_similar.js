import fs from "fs";
import natural from "natural";
const tokenizer = new natural.WordTokenizer();

export default async function findSimilar(inputText) {
  const problems = JSON.parse(fs.readFileSync("./data/problems.json", "utf-8"));
  const inputTokens = tokenizer.tokenize(inputText);

  const results = problems.map((p) => {
    const tokens = tokenizer.tokenize(p.title);
    const overlap = tokens.filter((t) => inputTokens.includes(t)).length;
    const score = overlap / Math.max(tokens.length, 1);
    return { ...p, similarity: score };
  });

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, 6);
}
