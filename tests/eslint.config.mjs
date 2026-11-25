// Règles de relecture automatique du JavaScript de Closer (lancées par tests/qualite.py).
// Les fichiers js/ partagent le même espace global : ils sont relus ensemble, dans l’ordre de index.html.
import globals from "globals";
export default [{
  files: ["**/*.js"],
  languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.browser, APPV: "readonly", supabase: "readonly" } },
  rules: {
    "no-undef": "error", "no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none" }],
    "no-redeclare": "error", "no-dupe-keys": "error", "no-dupe-else-if": "error", "no-duplicate-case": "error",
    "no-unreachable": "error", "no-self-assign": "error", "no-self-compare": "error", "no-constant-condition": ["warn",{checkLoops:false}],
    "use-isnan": "error", "valid-typeof": "error", "no-func-assign": "error", "no-import-assign": "error",
    "no-loss-of-precision": "error", "no-sparse-arrays": "warn", "no-unsafe-finally": "error", "no-fallthrough": "warn",
    "no-shadow-restricted-names": "error", "no-empty": ["warn",{allowEmptyCatch:true}], "eqeqeq": ["warn","smart"]
  }
}];
