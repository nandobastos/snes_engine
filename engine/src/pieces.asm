; ---------------------------------------------------------------------------------
; draw_pieces: desenha um "metasprite" (varios pedacos 16x16) direto no buffer da OAM.
;
; Parametros em variaveis globais (src/fight.c, todas u16):
;   ms_x, ms_y   canto do quadro na tela (se ms_flip, ms_x ja inclui o espelho)
;   ms_first     indice do primeiro pedaco nas tabelas pp_dx/pp_dy
;   ms_n         quantos pedacos
;   ms_attr      byte de atributos (prioridade, paleta, espelho)
;   ms_flip      0 = normal, 1 = espelhado (x = ms_x - dx)
;   ms_tile      tile do primeiro pedaco (os seguintes vem em sequencia: 0,2,..,14 e depois 32,34,..)
;   ms_sprite    proximo sprite livre da OAM (atualizado na saida)
; Pedacos fora da tela sao pulados.
; Versao enxuta (rodada 32): variaveis de RAM por endereco curto (.w; o banco de dados e o da RAM, como no codigo
; do tcc), so as tabelas da ROM por endereco longo; Y = posicao na OAM, X = pedaco.
; ---------------------------------------------------------------------------------
.include "hdr.asm"

.ACCU 16
.INDEX 16
.16BIT

.SECTION ".pieces_text" SUPERFREE

pieces_hibit:
    .db 1, 4, 16, 64

draw_pieces:
    php
    rep #$30
    phx
    phy
    lda.w ms_n
    bne +
    jmp _dp_end
+   sta.w ms_cnt
    lda.w ms_sprite
    cmp #128
    bcc +
    jmp _dp_end
+   asl a
    asl a
    tay                     ; Y = byte do sprite na OAM
    lda.w ms_first
    tax                     ; X = pedaco
_dp_loop:
    ; ---- y na tela (pula se fora: -16 < y < 224)
    lda.l pp_dy,x
    and #$00FF
    clc
    adc.w ms_y
    sta.w ms_sy
    clc
    adc #16
    cmp #240
    bcc +
    jmp _dp_next
+
    ; ---- x na tela (pula se fora: -16 < x < 256)
    lda.l pp_dx,x
    and #$00FF
    sta.w ms_tmp
    lda.w ms_flip
    beq _dp_nf
    lda.w ms_x
    sec
    sbc.w ms_tmp
    bra _dp_hx
_dp_nf:
    lda.w ms_x
    clc
    adc.w ms_tmp
_dp_hx:
    sta.w ms_sx
    clc
    adc #16
    cmp #272
    bcc +
    jmp _dp_next
+
    ; ---- grava na OAM
    sep #$20
    lda.w ms_sx
    sta.w oamMemory,y
    lda.w ms_sy
    sta.w oamMemory+1,y
    lda.w ms_tile
    sta.w oamMemory+2,y
    lda.w ms_tile+1         ; bit 8 do tile
    and #$01
    ora.w ms_attr
    sta.w oamMemory+3,y
    rep #$20
    ; 9o bit do X (sprite saindo pela esquerda)
    lda.w ms_sx
    bpl _dp_pos
    phx
    tya
    lsr a
    lsr a                   ; sprite
    pha
    and #3
    tax
    sep #$20
    lda.l pieces_hibit,x
    sta.w ms_tmp
    rep #$20
    pla
    lsr a
    lsr a
    tax
    sep #$20
    lda.w oamMemory+512,x
    ora.w ms_tmp
    sta.w oamMemory+512,x
    rep #$20
    plx
_dp_pos:
    iny
    iny
    iny
    iny
    cpy #512                ; 128 sprites
    bcs _dp_full
_dp_next:
    ; tiles em sequencia: 0,2,..,14 e depois 32,34,.. (8 pedacos por faixa de 32 chars)
    lda.w ms_tile
    inc a
    inc a
    bit #$000F
    bne +
    clc
    adc #16
+   sta.w ms_tile
    inx
    dec.w ms_cnt
    beq _dp_full
    jmp _dp_loop
_dp_full:
    tya
    lsr a
    lsr a
    sta.w ms_sprite
_dp_end:
    rep #$30
    ply
    plx
    plp
    rtl

.ENDS
