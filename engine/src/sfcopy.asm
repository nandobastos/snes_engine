; ---------------------------------------------------------------------------------
; sf_copy: copia bytes do PACK (ROM, qualquer banco) para a RAM (banco $7E, onde ficam as variaveis do C).
; Parametros em variaveis globais (src/fight.c, todas u16):
;   pk_dst   endereco de destino na RAM ($7E:pk_dst)
;   pk_src   endereco de origem (dentro do banco)
;   pk_bank  banco de origem (ex.: $A0 = inicio do pack, ver tools/sfpack.py)
;   pk_n     quantos bytes
; void sf_copy(void)
; ---------------------------------------------------------------------------------
.include "hdr.asm"

.ACCU 16
.INDEX 16
.16BIT

.SECTION ".sfcopy_text" SUPERFREE

sf_copy:
    php
    rep #$30
    phy
    lda.w pk_n
    beq _sc_end
    lda.w pk_src
    sta.b tcc__r1
    lda.w pk_dst
    sta.b tcc__r2
    sep #$20
    lda.w pk_bank
    sta.b tcc__r1h
    rep #$20
    ldy #0
_sc_loop:
    sep #$20
    lda [tcc__r1],y
    sta (tcc__r2),y
    rep #$20
    iny
    cpy.w pk_n
    bne _sc_loop
_sc_end:
    ply
    plp
    rtl

.ENDS
