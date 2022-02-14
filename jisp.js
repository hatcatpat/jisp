//==============================
var jispDebug = false

const log = (...x) => {
  if (jispDebug) console.log(...x)
}
const error = console.error

function isQuote(c) {
  return c === "'" || c === '"' || c === "`"
}

//==============================
// takes a single sexp, i.e (+ 2 4 (* 5 6)), and splits it into a simple ast, ["+","2","4",["*","5","6"]]
//==============================
function toAST(sexp) {
  sexp = sexp.trim()

  if ((sexp.match(/\(/g) || []).length != (sexp.match(/\)/g) || []).length) {
    error("[jisp]\n", "uneven number of parenthesis in sexp!")
    return []
  }

  if (sexp[0] === "(" && sexp[sexp.length - 1] === ")") sexp = sexp.slice(1, -1)

  const ast = []
  const ret = []
  let part = ast
  let word = ""

  let quote = false
  let array = false
  let override = false

  function pushWord() {
    if (word.length) {
      part.push(word)
      word = ""
    }
  }

  for (let i = 0; i < sexp.length; ++i) {
    const c = sexp[i]

    if (!override) {
      if (c === "\\") {
        override = true
        continue
      }

      if (!quote && c === " ") {
        pushWord()
        continue
      }

      if (isQuote(c)) quote = !quote

      if (!quote) {
        if (c === "(" || c === "[") {
          pushWord()
          ret.push(part)
          part.push([])
          part = part[part.length - 1]

          if (c === "[") {
            word = "list"
            pushWord()
          }

          continue
        } else if (c === ")" || c === "]") {
          pushWord()
          part = ret.pop()
          continue
        }
      }
    }

    if (override) override = false

    word += c
    if (i == sexp.length - 1) pushWord()
  }

  return ast
}

//=====================================
// returns an array of sexps inside a jisp string
//=====================================
function parseString(str) {
  str = str.replaceAll(/\t/g, "")

  const sexps = [""]
  let depth = 0
  let comment = false

  for (const c of str) {
    if (c === ";") {
      comment = !comment
      continue
    } else if (c === "\n") {
      comment = false
      continue
    }

    if (comment) continue

    if (c === "(") {
      if (depth == 0) sexps.push("")
      depth++
    } else if (c === ")") {
      depth--
    }

    sexps[sexps.length - 1] += c
  }

  return sexps.filter(x => x.trim().length)
}

//=====================================
class JispSymbol extends String {
  constructor(value) {
    super(value)
  }
}

//=====================================
class JispLiteral extends String {
  constructor(value) {
    super(value)
  }
}

//=====================================
class JispList extends Array {
  constructor(...value) {
    super(...value)
  }

  toString() {
    return `[${super.toString(this)}]`
  }

  toCommaString() {
    return super.toString(this)
  }
}

//==============================
function simpleOperator(op, ...args) {
  if (args.length == 1) {
    return `(${op} ${args[0]})`
  } else {
    let s = ""
    args.forEach((v, i) => {
      s += v
      if (i < args.length - 1) s += ` ${op} `
    })
    return `(${s})`
  }
}

//=====================================
const types = {
  number: x => {
    const f = parseFloat(x)
    return isNaN(f) ? undefined : f
  },
  literal: x => (x[0] === "," ? new JispLiteral(x.slice(1)) : undefined),
  string: x => (x[0] === '"' && x[x.length - 1] === '"' ? x : undefined),
  bool: x => (x === "true" ? true : x === "false" ? false : undefined),
  nil: x => (x === "nil" ? null : undefined),
}

//==============================
// takes a simple ast and converts it to js types
//==============================
function parseAST(ast) {
  function convert(part) {
    if (Array.isArray(part)) {
      return part.map(convert)
    } else {
      for (const [name, type] of Object.entries(types)) {
        const c = type(part)
        if (c === undefined) continue
        return c
      }

      return new JispSymbol(part)
    }
  }

  return ast.map(convert)
}

//==============================
// convert jisp ASTs into js
//==============================
const transformers = {
  let: (vars, ...body) => {
    body[body.length - 1] = `return ${body[body.length - 1]}`
    vars = vars.reduce((s, x) => s + `let ${x[0]} = ${x[1]}\n`, "")
    return `(() => {\n${vars} ${body.join("\n")}\n})()`
  },

  // variables
  def: (name, value) => `let ${name} = ${value}`,
  global: (name, value) => `${name} = ${value}`,
  set: (name, value) => `${name} = ${value}`,

  // functions
  fn: (args, ...body) => {
    body[body.length - 1] = `return ${body[body.length - 1]}`
    args = args.map(x => (x instanceof JispList ? `${x[0]} = ${x[1]}` : x))
    return `((${args.toCommaString()}) => { ${body.join("\n")} })`
  },

  call: (fn, ...args) => `${fn}(${args})`,

  // lists
  list: (...x) => new JispList(...x),
  each: (list, fn) => `;${list}.forEach(${fn})`,
  map: (list, fn) => `${list}.map(${fn})`,
  at: (list, index) => `${list}.at(${index})`,
  rest: list => `${list}.slice(1)`,
  first: list => `${list}.at(0)`,

  // iter
  for: (it, ...body) => {
    const i = it[0]
    const init = it[1]
    const n = it[2]
    return `for(let ${i}=${init}; ${i} < ${n}; ++${i}) {
			${body.join("\n")}
		}`
  },

  // string
  format: str => {
    const match_dollar_curly_pairs = /\$\{.+?\}/g
    const match_newline_tabs = /\n\t*/g

    let js = str.match(match_dollar_curly_pairs)
    if (!js) return str

    js = js.map(x => jispCompile(x.trim().slice(2, -1)))

    str = str
      .split(match_dollar_curly_pairs)
      .filter(x => x.length)
      .map((x, i) => (i <= js.length - 1 ? (x += `\$\{${js[i]}\}`) : x))
      .join("")
      .slice(1, -1)

    str = `\`${str}\``

    return str
  },

  // macros
  macro: (name, fn) => {
    fn = `return ${fn}(...arguments)`
    JispMacros[name] = Function(fn)
    return
  },

  // operators
  "+": (...x) => simpleOperator("+", ...x),
  "-": (...x) => simpleOperator("-", ...x),
  "*": (...x) => simpleOperator("*", ...x),
  "/": (...x) => simpleOperator("/", ...x),
  "|": (...x) => simpleOperator("||", ...x),
  "&": (...x) => simpleOperator("&&", ...x),
  "<": (...x) => simpleOperator("<", ...x),
  "<=": (...x) => simpleOperator("<=", ...x),
  ">": (...x) => simpleOperator(">", ...x),
  ">=": (...x) => simpleOperator(">=", ...x),
  "=": (...x) => simpleOperator("==", ...x),
  "%": (...x) => simpleOperator("%", ...x),
}

//==============================
// converts jisp into different jisp
//==============================
const JispMacros = {}

//==============================
// takes an ast and applies transformations to generate valid js
//==============================
function toJS(ast) {
  function compile(ast) {
    if (!ast.length) return []

    ast = ast.map(x => (Array.isArray(x) ? compile(x) : x))

    const op = ast[0]
    const args = ast.slice(1)

    log("op", op)
    log("args", args)

    if (typeof op === "number") return transformers.list(...ast)
    else if (op instanceof JispList || typeof op === "string") return op
    else if (op instanceof JispLiteral) return `${op} ${args}`
    else if (JispMacros.hasOwnProperty(op)) {
      return jispCompile(JispMacros[op](...args))
    } else if (transformers.hasOwnProperty(op)) return transformers[op](...args)
    else return transformers.call(op, ...args)
  }

  return compile(ast)
}

//==============================
function jispCompile(input) {
  let jisp
  if (jispDebug) {
    jisp = parseString(input)
    log("parsed", jisp)
    jisp = jisp.map(toAST)
    log("ast", jisp)
    jisp = jisp.map(parseAST)
    log("parsed ast", jisp)
    jisp = jisp.map(toJS)
    log("js", jisp)
    jisp = jisp.join("\n")
  } else jisp = parseString(input).map(toAST).map(parseAST).map(toJS).join("\n")

  log("input:\n", input)
  log("output:\n", jisp)

  return jisp
}

//==============================
// evals a given jisp string it
//==============================
function jispEval(input) {
  return Function(jispCompile(input))()
}

//==============================
// converts jisp to js and writes it into a script tag
//==============================
function jispWrite(input) {
  const script = document.createElement("script")
  const text = document.createTextNode(jispCompile(input))
  script.append(text)
  document.body.appendChild(script)
}

//==============================
// searches document for jisp scripts and evals them
//==============================
function jispEvalAll() {
  Array.from(document.getElementsByTagName("script"))
    .filter(x => x.type === "text/jisp")
    .forEach(x => jispEval(x.innerText))
}

jispEvalAll()

//==============================
// evals given file
//==============================
function jispEvalFile(file) {
  if (!file.endsWith(".jisp")) return

  fetch(file)
    .then(response => response.text())
    .then(jispEval)
}

jispEvalFile("test.jisp")
