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
    ; DMA (canal 0) da ROM do pack para a RAM pela porta $2180 (WRAM): o registrador de direct page do tcc (tcc__r1/2) nao serve para
    ; copias longas, porque a NMI da PVSnesLib mexe nele no meio da copia (a copia de 22 KB ficava com bytes errados)
    php
    rep #$20
    lda.w pk_n
    beq _sc_end
    lda.w pk_dst
    sta.l $2181             ; endereco na WRAM (bit 16 = 0: banco $7E)
    sep #$20
    lda.w pk_db             ; 0 = banco $7E, 1 = banco $7F
    sta.l $2183
    rep #$20
    lda #$8000              ; DMA modo 0 (1 registrador), destino $2180 (WMDATA)
    sta.l $4300
    lda.w pk_src
    sta.l $4302
    sep #$20
    lda.w pk_bank
    sta.l $4304
    rep #$20
    lda.w pk_n
    sta.l $4305
    sep #$20
    lda #$01
    sta.l $420B
_sc_end:
    plp
    rtl

; ---------------------------------------------------------------------------------
; sf_peek: como o sf_copy (pk_bank:pk_src -> $7E:pk_dst, pk_n bytes), mas pela CPU e sem DMA: serve no meio da logica do jogo
; (poucos bytes, sem disputar canal de DMA com a NMI). void sf_peek(void)
; ---------------------------------------------------------------------------------
sf_peek:
    php
    phb
    rep #$30
    lda.w pk_n
    beq _sp_end
    ldy.w pk_src
    ldx.w pk_dst
    pha                     ; contador na pilha (1,s)
    sep #$20
    lda.w pk_bank
    pha
    plb                     ; DB = banco de origem
_sp_loop:
    lda.w $0000,y
    sta.l $7E0000,x
    inx
    iny
    rep #$20
    lda 1,s
    dec a
    sta 1,s
    sep #$20
    bne _sp_loop
    rep #$20
    pla
_sp_end:
    plb
    plp
    rtl

; ---------------------------------------------------------------------------------
; sf_vram: DMA do pack (pk_bank:pk_src, pk_n bytes) para a VRAM (endereco em palavras = pk_dst). Mesmas regras do dmaCopyVram (tela apagada/vblank).
; sf_cgram: DMA do pack para a CGRAM (pk_dst = indice da cor, 0-255). void sf_vram(void), void sf_cgram(void)
; ---------------------------------------------------------------------------------
sf_vram:
    php
    rep #$20
    lda.w pk_dst
    sta.l $2116
    sep #$20
    lda #$80
    sta.l $2115
    rep #$20
    lda #$1801              ; DMA modo 1 (A->B, 2 registradores), destino $2118/$2119
    sta.l $4300
    lda.w pk_src
    sta.l $4302
    sep #$20
    lda.w pk_bank
    sta.l $4304
    rep #$20
    lda.w pk_n
    sta.l $4305
    sep #$20
    lda #$01
    sta.l $420B
    plp
    rtl

sf_cgram:
    php
    sep #$20
    lda.w pk_dst
    sta.l $2121
    rep #$20
    lda #$2200              ; DMA modo 0, destino $2122
    sta.l $4300
    lda.w pk_src
    sta.l $4302
    sep #$20
    lda.w pk_bank
    sta.l $4304
    rep #$20
    lda.w pk_n
    sta.l $4305
    sep #$20
    lda #$01
    sta.l $420B
    plp
    rtl

.ENDS
