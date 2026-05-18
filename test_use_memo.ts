import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default || _traverse;
import * as fs from "fs";

function analyzeUseMemo(filePath: string) {
  const code = fs.readFileSync(filePath, "utf-8");
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  let hasUseMemo = false;
  traverse(ast, {
    CallExpression(path: any) {
      if (
        path.node.callee.type === "Identifier" &&
        path.node.callee.name === "useMemo"
      ) {
        hasUseMemo = true;
      }
      if (
        path.node.callee.type === "MemberExpression" &&
        path.node.callee.object.type === "Identifier" &&
        path.node.callee.object.name === "React" &&
        path.node.callee.property.type === "Identifier" &&
        path.node.callee.property.name === "useMemo"
      ) {
        hasUseMemo = true;
      }
    },
  });
  console.log(`${filePath}: ${hasUseMemo}`);
}

const files = process.argv.slice(2);
files.forEach(analyzeUseMemo);
