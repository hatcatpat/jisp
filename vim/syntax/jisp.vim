syntax keyword JispKeyword def
syntax keyword JispKeyword let
syntax keyword JispKeyword if
syntax keyword JispKeyword cond
syntax keyword JispKeyword set
syntax keyword JispKeyword global
syntax keyword JispKeyword at
syntax keyword JispKeyword for
syntax keyword JispKeyword each
syntax keyword JispKeyword rest
syntax keyword JispKeyword first
syntax keyword JispKeyword map
syntax keyword JispKeyword macro
syntax keyword JispKeyword format

syntax region JispString start=/"/ end=/"/

syntax keyword JispFunction fn
syntax match JispComment /;.*$/

highlight link JispKeyword Keyword
highlight link JispFunction Function
highlight link JispComment Comment
highlight link JispString String

let b:current_syntax = "jisp"
