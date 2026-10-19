export function numberedParameters(sql) {
  let output = "";
  let parameter = 0;
  let quote = null;
  for (let index = 0; index < sql.length; index++) {
    const character = sql[index];
    if (quote) {
      output += character;
      if (character === quote && sql[index + 1] === quote) output += sql[++index];
      else if (character === quote) quote = null;
    } else if (character === "'" || character === '"') {
      quote = character;
      output += character;
    } else if (character === "?") output += `$${++parameter}`;
    else output += character;
  }
  return output;
}
