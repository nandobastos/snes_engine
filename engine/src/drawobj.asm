; ---------------------------------------------------------------------------------
; draw_obj e do_uploads em assembly (em C, com o tcc, custavam ~40 e ~25 linhas de tela por quadro).
;
; void draw_obj(u8 o, s16 sx, s16 alt, u8 flip, u8 pal)
;   desenha o objeto o (0/1 lutadores, 2/3 bolas, 4/5 sombras, 6 faisca) com o quadro que esta na VRAM
;   (fshown[o]); pes em sx (px do mundo), alt = altura dos pes (px). Mesma logica da versao em C:
;   quadro real = fshown + obj_off; no ar o corpo (faixa) manda; cache da ultima posicao (nao redesenha igual);
;   zera os bits altos da faixa do objeto, chama draw_pieces e esconde o que sobrou do desenho anterior.
;   Argumentos na pilha (convencao do tcc, empilhados da direita para a esquerda): depois do php:
;   o = 5,s   sx = 6,s   alt = 8,s   flip = 10,s   pal = 11,s
;
; void do_uploads(void)
;   executa a fila de envios para a VRAM (up_src/up_dst/up_sz, up_n itens) com DMA no canal 0. Chamar no vblank.
; ---------------------------------------------------------------------------------
.include "hdr.asm"

.ACCU 16
.INDEX 16
.16BIT

.SECTION ".drawobj_text" SUPERFREE

.DEFINE UP_MAX 32           ; pecas por vblank (medido: com 40 o envio passava do fim do vblank e perdia pedacos: 61 casos em 1500 quadros de luta do DonLee; com 32, zero)
.DEFINE BUF_CH 96

.include "res/chunks.inc"   ; chunk_tab: endereco (24 bits + 1 byte) de cada bloco de graficos dos lutadores

draw_obj:
    php
    rep #$30
    lda 5,s
    and #$00FF
    sta.l do_o
    tax
    lda 6,s
    sec
    sbc.l cam
    sta.l do_sx
    lda 8,s
    sta.l do_alt
    lda 10,s
    and #$00FF
    sta.l do_flip
    lda 11,s
    and #$00FF
    sta.l do_pal
    phx
    phy
    lda.l do_o
    tax
    ; quadro na VRAM; 255 = nada para desenhar
    lda.l fshown,x
    and #$00FF
    cmp #255
    bne +
    jmp _do_hide
+   sta.l do_f
    lda.l fwant,x
    and #$00FF
    cmp #255
    bne +
    jmp _do_hide
+   ; quadro real (personagem)
    txa
    asl a
    tax
    lda.l obj_off,x
    clc
    adc.l do_f
    sta.l do_rf
    ; no ar (lutadores): alt += belt_ref[fchar[o]] + belt - h
    lda.l do_o
    cmp #2
    bcs _do_nobelt
    tax
    lda.l fstate,x
    and #$00FF
    cmp #3                  ; ST_JUMP
    bne _do_nobelt
    lda.l do_rf
    tax
    lda.l pf_belt,x
    and #$00FF
    cmp #255
    beq _do_nobelt
    sta.l do_tmp
    lda.l pf_h,x
    and #$00FF
    sta.l do_tmp2
    lda.l do_o
    tax
    lda.l fchar,x
    and #$00FF
    tax
    lda.l belt_ref,x
    and #$00FF
    clc
    adc.l do_tmp
    sec
    sbc.l do_tmp2
    clc
    adc.l do_alt
    sta.l do_alt
_do_nobelt:
    ; ms_y = GROUND_Y - alt - h
    lda.l do_rf
    tax
    lda.l pf_h,x
    and #$00FF
    clc
    adc.l do_alt
    sta.l do_tmp
    lda #187                ; GROUND_Y (src/fight.c)
    sec
    sbc.l do_tmp
    sta.l ms_y
    ; kk = flip | pal << 1 | sbuf << 5 (lutadores)
    lda.l do_pal
    asl a
    ora.l do_flip
    sta.l do_kk
    lda.l do_o
    cmp #2
    bcs +
    tax
    lda.l sbuf,x
    and #$00FF
    asl a
    asl a
    asl a
    asl a
    asl a
    ora.l do_kk
    sta.l do_kk
+   ; igual ao desenho anterior? (quadro, lado/paleta/buffer, posicao)
    lda.l do_o
    tax
    lda.l oc_f,x
    and #$00FF
    cmp.l do_f
    bne _do_new
    lda.l oc_k,x
    and #$00FF
    cmp.l do_kk
    bne _do_new
    txa
    asl a
    tax
    lda.l oc_x,x
    cmp.l do_sx
    bne _do_new2
    lda.l oc_y,x
    cmp.l ms_y
    bne _do_new2
    ply
    plx
    plp
    rtl
_do_new:
    txa
    asl a
    tax
_do_new2:
    ; X = o * 2: guarda a posicao e o primeiro tile do objeto
    lda.l do_sx
    sta.l oc_x,x
    lda.l ms_y
    sta.l oc_y,x
    lda.l slot_char,x
    sta.l ms_tile
    lda.l do_o
    tax
    sep #$20
    lda.l do_f
    sta.l oc_f,x
    lda.l do_kk
    sta.l oc_k,x
    rep #$20
    ; lutadores: o bloco da VRAM que esta na tela
    cpx #2
    bcs +
    lda.l sbuf,x
    and #$00FF
    beq +
    lda.l ms_tile
    clc
    adc #96                 ; BUF_CH
    sta.l ms_tile
+   lda.l do_rf
    tax
    lda.l pf_count,x
    and #$00FF
    sta.l ms_n
    txa
    asl a
    tax
    lda.l pf_first,x
    sta.l ms_first
    lda #0
    sta.l ms_tab
    lda.l do_pal
    asl a
    ora #$20
    sta.l ms_attr
    lda.l do_flip
    beq _do_nf
    lda #1
    sta.l ms_flip
    lda.l do_sx
    clc
    adc #48
    sta.l ms_x
    lda.l ms_attr
    ora #$40
    sta.l ms_attr
    bra _do_fd
_do_nf:
    lda #0
    sta.l ms_flip
    lda.l do_sx
    sec
    sbc #64
    sta.l ms_x
_do_fd:
    ; zera os bits altos (x negativo) dos bytes da faixa deste objeto
    lda.l do_o
    tax
    lda.l oam_base,x
    and #$00FF
    sta.l do_base
    sta.l ms_sprite
    lda.l oam_cap,x
    and #$00FF
    clc
    adc.l do_base
    lsr a
    lsr a
    sta.l do_tmp
    lda.l do_base
    lsr a
    lsr a
    tax
_do_zl:
    txa
    cmp.l do_tmp
    bcs _do_zd
    sep #$20
    lda #0
    sta.l oamMemory+512,x
    rep #$20
    inx
    bra _do_zl
_do_zd:
    jsl draw_pieces
    ; o que sobrou do desenho anterior some
    rep #$30
    lda.l do_o
    tax
    lda.l oam_n,x
    and #$00FF
    clc
    adc.l do_base
    sta.l do_tmp
    lda.l ms_sprite
_do_hl:
    cmp.l do_tmp
    bcs _do_hd
    pha
    asl a
    asl a
    tax
    sep #$20
    lda #240
    sta.l oamMemory+1,x
    rep #$20
    pla
    inc a
    bra _do_hl
_do_hd:
    lda.l ms_sprite
    sec
    sbc.l do_base
    sta.l do_tmp
    lda.l do_o
    tax
    sep #$20
    lda.l do_tmp
    sta.l oam_n,x
    rep #$20
    ply
    plx
    plp
    rtl

_do_hide:
    ; hide_obj(o): esconde os sprites usados e esquece o ultimo desenho
    lda.l do_o
    tax
    sep #$20
    lda #255
    sta.l oc_f,x
    rep #$20
    lda.l oam_n,x
    and #$00FF
    beq _do_hx
    tay                     ; Y = sprites a esconder
    lda.l oam_base,x
    and #$00FF
_do_hl2:
    pha
    asl a
    asl a
    tax
    sep #$20
    lda #240
    sta.l oamMemory+1,x
    rep #$20
    pla
    inc a
    dey
    bne _do_hl2
    lda.l do_o
    tax
    sep #$20
    lda #0
    sta.l oam_n,x
    rep #$20
_do_hx:
    ply
    plx
    plp
    rtl

do_uploads:
    php
    rep #$30
    phx
    lda.l up_n
    and #$00FF
    beq _du_end
    sta.l do_tmp
    sep #$20
    lda #$80                ; VMAIN: incrementa depois do byte alto
    sta.l $2115
    lda #$01                ; DMA modo 1 (2 registradores: $2118/$2119)
    sta.l $4300
    lda #$18
    sta.l $4301
    rep #$20
    ldx #0
_du_loop:
    lda.l up_dst,x
    sta.l $2116
    lda.l up_sz,x
    sta.l $4305
    txa
    asl a
    tax
    lda.l up_src,x
    sta.l $4302
    lda.l up_src+2,x
    sep #$20
    sta.l $4304
    lda #$01
    sta.l $420B
    rep #$20
    txa
    lsr a
    tax
    inx
    inx
    lda.l do_tmp
    dec a
    sta.l do_tmp
    bne _du_loop
_du_end:
    sep #$20
    lda #0
    sta.l up_n
    sta.l up_used
    rep #$20
    plx
    plp
    rtl

; ---------------------------------------------------------------------------------
; void plan_frames(void): escolhe os quadros novos que vao para a VRAM no proximo vblank (fila up_*), na ordem
; up_order (bolas, sombras e faisca primeiro). Mesma logica da versao em C (rodadas anteriores):
;   - quadro de lutador maior que UP_MAX: vai em pedacos de 8 pecas para o bloco que NAO esta na tela; quando
;     termina, o bloco troca (sbuf ^= 1)
;   - o resto vai inteiro, se couber no que sobra do orcamento deste vblank (o primeiro sempre cabe)
plan_frames:
    php
    rep #$30
    phx
    phy
    lda #UP_MAX
    sta.w pl_budget
    sep #$20
    lda.w dbg_on
    beq +
    lda #6                  ; o debug usa parte do vblank
    sta.w pl_budget
+   lda.w fanim
    cmp #255
    beq +
    clc
    adc.w fidx
    sta.w fwant
+   lda.w fanim+1
    cmp #255
    beq +
    clc
    adc.w fidx+1
    sta.w fwant+1
+   rep #$20
    ldy #0
_pl_loop:
    tya
    tax
    lda.l up_order,x
    and #$00FF
    sta.w pl_i
    tax
    lda.w fwant,x
    and #$00FF
    cmp #255
    bne +
    jmp _pl_next
+   sta.w pl_f
    lda.w fshown,x
    and #$00FF
    cmp.w pl_f
    bne +
    jmp _pl_next
+   txa
    asl a
    tax
    lda.w obj_off,x
    clc
    adc.w pl_f
    sta.w pl_rf
    tax
    lda.l pf_count,x
    and #$00FF
    sta.w pl_cnt
    sta.w pl_c
    lda.w pl_i
    cmp #2
    bcc +
    jmp _pl_small
+   lda.w pl_c
    cmp #UP_MAX+1
    bcs +
    jmp _pl_small
+
    ; ---- lutador com quadro grande: pedaco de 8 pecas no bloco escondido
    ldx.w pl_i
    sep #$20
    lda.w up_t,x
    cmp.w pl_f
    beq +
    lda.w pl_f
    sta.w up_t,x
    lda #0
    sta.w up_ch,x
+   rep #$20
    lda.w up_ch,x
    and #$00FF
    sta.w pl_ch
    asl a
    asl a
    asl a
    sta.w pl_tmp
    lda.w pl_c
    sec
    sbc.w pl_tmp
    cmp #9
    bcc +
    lda #8
+   sta.w pl_c
    jsr _pl_fits
    bcs +
    jmp _pl_next
+   ldx.w pl_i
    txa
    asl a
    tax
    lda.l slot_char,x
    sta.w pl_char0
    ldx.w pl_i
    lda.w sbuf,x
    and #$00FF
    bne +
    lda.w pl_char0
    clc
    adc #BUF_CH
    sta.w pl_char0
+   jsr _pl_queue
    ldx.w pl_i
    sep #$20
    lda.w up_ch,x
    inc a
    sta.w up_ch,x
    rep #$20
    and #$00FF
    asl a
    asl a
    asl a
    cmp.w pl_cnt
    bcs +
    jmp _pl_next
+   ; quadro inteiro no bloco escondido: troca o bloco
    sep #$20
    lda.w pl_f
    sta.w fshown,x
    lda.w sbuf,x
    eor #1
    sta.w sbuf,x
    lda #255
    sta.w up_t,x
    rep #$20
    jmp _pl_next
_pl_small:
    jsr _pl_fits
    bcs +
    jmp _pl_next
+
    ldx.w pl_i
    txa
    asl a
    tax
    lda.l slot_char,x
    sta.w pl_char0
    lda.w pl_i
    cmp #2
    bcs +
    tax
    sep #$20
    lda #255
    sta.w up_t,x
    rep #$20
    lda.w sbuf,x
    and #$00FF
    beq +
    lda.w pl_char0
    clc
    adc #BUF_CH
    sta.w pl_char0
+   stz.w pl_ch
    jsr _pl_queue
    lda.w pl_cnt
    cmp #9
    bcc +
    lda #1
    sta.w pl_ch
    jsr _pl_queue
    lda.w pl_cnt
    cmp #17                 ; 17 a 24 pecas: 3o pedaco (eram os pes do Sagat que nao chegavam na VRAM)
    bcc +
    lda #2
    sta.w pl_ch
    jsr _pl_queue
+   ldx.w pl_i
    sep #$20
    lda.w pl_f
    sta.w fshown,x
    rep #$20
_pl_next:
    iny
    cpy #7
    bcs +
    jmp _pl_loop
+   ply
    plx
    plp
    rtl

; cabe no orcamento? (up_used == 0 ou up_used + pl_c <= pl_budget). Carry = 1: cabe (e ja soma em up_used)
_pl_fits:
    lda.w up_used
    and #$00FF
    beq +
    clc
    adc.w pl_c
    cmp.w pl_budget
    beq +
    bcs _pl_nofit
+   lda.w up_used
    and #$00FF
    clc
    adc.w pl_c
    sep #$20
    sta.w up_used
    rep #$20
    sec
    rts
_pl_nofit:
    clc
    rts

; enfileira o pedaco pl_ch (ate 8 pecas) do quadro pl_rf no bloco de chars pl_char0: 2 envios (metade de cima e
; de baixo das pecas 16x16)
_pl_queue:
    phy
    ; k = min(8, cnt - ch*8); tamanho = k * 64
    lda.w pl_ch
    asl a
    asl a
    asl a
    sta.w pl_tmp
    lda.w pl_cnt
    sec
    sbc.w pl_tmp
    cmp #9
    bcc +
    lda #8
+   asl a
    asl a
    asl a
    asl a
    asl a
    asl a
    sta.w pl_sz
    ; origem: chunk_tab[pf_chunk[rf]] + pf_off[rf] + ch * 1024
    ldx.w pl_rf
    lda.l pf_chunk,x
    and #$00FF
    asl a
    asl a
    tax
    lda.l chunk_tab+2,x
    and #$00FF
    sta.w pl_bank
    lda.l chunk_tab,x
    sta.w pl_src
    lda.w pl_rf
    asl a
    tax
    lda.l pf_off,x
    clc
    adc.w pl_src
    sta.w pl_src
    lda.w pl_ch
    xba                     ; * 256
    asl a
    asl a                   ; * 1024
    clc
    adc.w pl_src
    sta.w pl_src
    ; destino: $6000 + char0 * 16 + ch * 512
    lda.w pl_char0
    asl a
    asl a
    asl a
    asl a
    clc
    adc #$6000
    sta.w pl_dst
    lda.w pl_ch
    xba
    asl a
    clc
    adc.w pl_dst
    sta.w pl_dst
    ; fila: up_src (4 bytes), up_dst, up_sz (2 bytes)
    lda.w up_n
    and #$00FF
    asl a
    tax
    tay                     ; Y = up_n * 2
    lda.w pl_dst
    sta.w up_dst,x
    clc
    adc #256
    sta.w up_dst+2,x
    lda.w pl_sz
    sta.w up_sz,x
    sta.w up_sz+2,x
    txa
    asl a
    tax                     ; X = up_n * 4
    lda.w pl_src
    sta.w up_src,x
    clc
    adc.w pl_sz
    sta.w up_src+4,x
    lda.w pl_bank
    sta.w up_src+2,x
    sta.w up_src+6,x
    sep #$20
    lda.w up_n
    clc
    adc #2
    sta.w up_n
    rep #$20
    ply
    rts

; ---------------------------------------------------------------------------------
; u8 motion_id(u8 id): comando de especial no historico do direcional do P1 (dir_hist, 1 cima 2 baixo 4 tras
; 8 frente). Mesma regra das versoes em C: procura os passos do ultimo para o primeiro; o ultimo passo tem que
; estar nos 15 quadros mais recentes, o comando inteiro nos 30.
; id: 0 = baixo, baixo-frente, frente; 1 = baixo, baixo-tras, tras; 2 = frente, baixo-frente (Shoryuken);
;     3 = frente, baixo-frente, frente (atalho do Shoryuken). Tabela: passos, (mascara, valor) do ultimo ao 1o.
; 4 = super: baixo, baixo-frente, frente duas vezes (linhas de 16 bytes)
mot_tab:
    .db 3, 14, 8, 14, 10, 14, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0
    .db 3, 14, 4, 14, 6, 14, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0
    .db 2, 14, 10, 14, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    .db 3, 12, 8, 14, 10, 14, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0
    .db 6, 14, 8, 14, 10, 14, 2, 14, 8, 14, 10, 14, 2, 0, 0, 0

motion_id:
    php
    rep #$30
    phx
    phy
    lda 9,s                 ; id (depois do php, phx, phy: retorno 3 + 1 + 2 + 2)
    and #$00FF
    asl a
    asl a
    asl a
    asl a
    sta.l do_tmp            ; base da linha da tabela (16 bytes)
    tax
    lda.l mot_tab,x
    and #$00FF
    sta.l do_tmp2           ; quantidade de passos
    lda #0
    sta.l do_base           ; passo atual (0 = o ultimo)
    ldy #0                  ; a = quadros para tras
_mi_loop:
    ; h = dir_hist[(hist_head - a) & 31]
    tya
    sta.l do_f              ; (temporario: a)
    lda.l hist_head
    and #$00FF
    sec
    sbc.l do_f
    and #31
    clc
    adc.l hist_off          ; historico do lutador (P1 = 0, P2 = 32)
    tax
    lda.l dir_hist,x
    and #$00FF
    sta.l do_f              ; h
    ; mascara/valor do passo atual: tab[base + 1 + passo*2]
    lda.l do_base
    asl a
    clc
    adc.l do_tmp
    tax
    lda.l mot_tab+1,x       ; mascara (byte baixo) e valor (byte alto)
    and.l do_f              ; byte baixo = h & mascara (o alto fica com lixo: compara so o baixo)
    sep #$20
    cmp.l mot_tab+2,x
    rep #$20
    bne _mi_no
    lda.l do_base
    inc a
    sta.l do_base
    cmp.l do_tmp2
    bne _mi_next
    lda #1
    bra _mi_ret
_mi_no:
    lda.l do_base
    bne _mi_next
    cpy #15
    bcs _mi_zero
_mi_next:
    iny
    cpy #30
    bcc _mi_loop
_mi_zero:
    lda #0
_mi_ret:
    sta.b tcc__r0
    ply
    plx
    plp
    rtl

; void clear_fwd_hist(void): tira o 'frente' de todo o historico do direcional
clear_fwd_hist:
    php
    rep #$30
    phx
    lda.l hist_off
    tax
    clc
    adc #32
    sta.l do_tmp
    sep #$20
_cf_loop:
    lda.l dir_hist,x
    and #$F7
    sta.l dir_hist,x
    inx
    cpx.w do_tmp
    bcc _cf_loop
    rep #$20
    plx
    plp
    rtl


; ---------------------------------------------------------------------------------
; u16 key_map(u16 raw): botoes do controle -> acoes da luta (remapeamento das Opcoes, src/menu.c).
; km_phys[a] = botao fisico da acao a; a acao vira o bit "padrao" dela (B Y A X L). R livre passa (debug).
km_bit:
    .dw $8000, $4000, $0080, $0040, $0020
key_map:
    php
    rep #$30
    phx
    lda 7,s                 ; raw (retorno 3 + php 1 + phx 2)
    sta.w km_raw
    and #$3F0F              ; tira B Y A X L R
    sta.w km_out
    ldx #0
-   lda.w km_raw
    and.w km_phys,x
    beq +
    lda.l km_bit,x
    ora.w km_out
    sta.w km_out
+   inx
    inx
    cpx #10
    bne -
    lda.w km_raw
    and.w km_free
    ora.w km_out
    sta.b tcc__r0
    plx
    plp
    rtl

.ENDS
