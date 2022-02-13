if exists('b:did_ftplugin')
  finish
endif
let b:did_ftplugin = 1

let filetype = "jisp"

"setl lisp
"setl lispwords+=def
"setl lispwords+=global
"setl lispwords+=let
"setl lispwords+=if
"setl lispwords+=cond
"setl lispwords+=fn
"setl lispwords+=set

setl comments=n:;
setl commentstring=;\ %s
