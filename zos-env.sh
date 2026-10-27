# Source this before running Node on z/OS:  . ./zos-env.sh
# Turns on automatic EBCDIC <-> ASCII conversion for tagged files and pipes.
export _BPXK_AUTOCVT=ON
export _CEE_RUNOPTS="FILETAG(AUTOCVT,AUTOTAG) POSIX(ON)"
export _TAG_REDIR_IN=txt
export _TAG_REDIR_OUT=txt
export _TAG_REDIR_ERR=txt
