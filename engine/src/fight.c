/*---------------------------------------------------------------------------------
    Fight - jogo de luta estilo Street Fighter II (SNES, PVSnesLib)

    Fluxo: splash/menu (src/menu.c) -> selecao de personagem -> tela de VS (3 s) -> luta.
    Camadas (modo 1, tiles 8x8):  BG1 cenario (stage.png)   BG3 barras de energia   OBJ lutadores

    Unidades: x em 1/8 de pixel (s16), altura do chao em 1/64 de pixel, tempo em quadros (60/s).
    Os sprites do Ryu sao pedacos de 16x16 (tools/mkfight.py) mandados por DMA so quando o quadro muda.
---------------------------------------------------------------------------------*/
#include <snes.h>
#include <string.h>

#include "res/fight.h"
#include "res/ryu.h"
#include "res/soundbank.h"
#include "res/ann.h"

#define REG_CGDATA (*(vuint8 *)0x2122)

// de src/menu.c
extern u8 wipe_phase, wipe_wsel;
extern u8 sfx_lv, sfx_hw;
u16 key_map(u16 raw); // src/drawobj.asm: botoes do controle -> acoes (remapeamento das Opcoes)
u8 sfx_cur; // conjunto de efeitos carregado (1 = menus)
extern char SOUNDBANK__;
#include "src/sfx.h" // efeitos de som (SFX_*)

#define SFX_NONE 255
#define SFX_PITCH 3 // (tom padrao; efeitos longos usam o 2, ver sfx_tom)
// tom 3 = 12132 Hz (a taxa de cada tom e 4044 Hz x tom; o 8 seria 32 kHz): amostras do mksfx nessa taxa
void play_sfx(u8 id);
void sfx_set_menu(void);
void draw_wins(void);
void sfx_set_voices(u8 which);
void sfx_set_fight(u8 c0, u8 c1);
void wipe_start(u8 reverse);
u8 wipe_update(void);
void wipe_regs(void);
void menu_boot(void);
void menu_run(void);
u16 fx_text(u8 *blk, u8 row, u8 pal, u16 t, u16 *map, u16 gfx);
u8 *fx_block_select(void);
u8 *fx_block_back(void);
u8 *fx_block_vs(void);
u8 *fx_block_ending(void);

// parametros da rotina em assembly draw_pieces (src/pieces.asm)
u16 ms_x, ms_y, ms_first, ms_n, ms_attr, ms_flip, ms_tab, ms_tile, ms_sprite;
u16 ms_sx, ms_sy, ms_i, ms_cnt, ms_tmp, ms_pat;
void draw_pieces(void);
// tabelas dos outros modos da rotina (nao usados aqui, mas o assembly referencia)
const u8 ep_dx[2] = {0, 0}, ep_dy[2] = {0, 0}, sp_dx[2] = {0, 0}, sp_dy[2] = {0, 0}, sp_attr[2] = {0, 0};
const u16 ep_char[2] = {0, 0};

u16 pad, pad_down, pad_last;
u16 pad2, pad2_down, pad2_last; // controle 2 (modo Versus)
enum { MODE_PRACTICE, MODE_ARCADE, MODE_VERSUS };
u8 game_mode;    // escolhido no titulo (src/menu.c)
u8 menu_fade;    // 1 = o titulo aparece com fade (depois do Game Over / final)
u16 prof_dummy;
#define PROFILING 0 // 1 = mede linhas de varredura gastas (cada medida custa ~3 linhas: so ligar para testar)
#if PROFILING
#define PROF(v) prof_dummy = *(vuint8 *)0x213F; prof_dummy = *(vuint8 *)0x2137; v = *(vuint8 *)0x213D; v |= (*(vuint8 *)0x213D & 1) << 8
#else
#define PROF(v)
#endif
enum { TRK_MOVESET, TRK_FRAME_BASE, TRK_FX_BASE, TRK_JUMP_VY, TRK_WALK_ADJ, TRK_WALK_TICKS, TRK_FB_PAL, TRK_FB_ALT_HI, TRK_FB_ALT_LO,
       TRK_PAL_ASSET, TRK_PAL_ALT, TRK_DIRSWAP, TRK_FBPAL_ASSET, TRK_FBPAL_OFF1, TRK_FBPAL_OFF2, TRK_FB_SFX, TRK_HP_CLOSE_HK, TRK_PINGPONG, TRK_FACE_PAL, TRK_FACE_ALT, TRK_GAMEOVER_FP, TRK_ARCADE_OPP };
u16 pk_trait(u8 ch, u8 k);
u8 pk_i, pk_j;
u8 ftc[4 * 8];   // tracos das telas (retrato, game over, 1o oponente) de ate 8 lutadores, lidos do pack uma vez no boot
#define FTC(ch, k) ftc[((k) - TRK_FACE_PAL) * 8 + (ch)]
u8 game_screen; // 0 menus, 1 selecao, 2 VS, 3 luta (usado pelos testes)
u8 sel_char[2];  // personagens escolhidos na selecao (P1, P2)
u8 fchar[2];     // logica do lutador na luta: 0 = Ryu (o Boxer tambem), 1 = Sagat
u8 fgfx[2];      // personagem escolhido (CH_*): decide quadros, paletas e retrato
u16 choff[2];    // primeiro quadro do personagem na tabela (0 = Ryu, SAGAT_OFF = Sagat)
u16 obj_off[7];  // o mesmo por objeto desenhado (lutadores, bolas; sombras e faisca = 0)

#define VRAM_BG1_GFX 0x0000
#define VRAM_BG1_MAP 0x1800
#define VRAM_BG3_MAP 0x1C00
#define VRAM_BG3_GFX 0x2000
#define VRAM_OBJ_GFX 0x6000
#define PRIO 0x2000
#define VRAM_BG2_GFX 0x4000 // barra de vida: fundo preto + dano pendente (vermelho), atras da barra amarela do BG3
#define VRAM_BG2_MAP 0x4800
#define DBG_TILE0 40      // primeiro tile do debug no BG3 (0-38 sao as barras de vida e de super)

#define GROUND_Y 187      // linha da tela onde ficam os pes (como no SF2: a arena ocupa 192 linhas, entre tarjas pretas)
#define SCENE_DY 21       // o cenario (BG1) sobe 21 linhas: os pes continuam no mesmo ponto do chao desenhado
#define BAR_ON 17         // tarja de cima: linhas 0-16 apagadas
#define BAR_OFF 204       // tarja de baixo: apagada a partir da linha 204 (area visivel = 187 linhas)
#define HUD_HP 4          // linha de tiles da barra de vida (a area visivel comeca na linha 17 = tile 2)
#define HUD_WIN 5         // bolinhas de round
#define HUD_SP 23         // bolinhas e barra de super (linhas 23 e 24: rente ao fim da arena)
#define FRAME_VBLANKS 1 // 1 = 60 quadros/s (padrao), 2 = 30 quadros/s (2 passos de logica por quadro, desenha a metade)
#define CAM_MAX 128 // arena de 384 px; a tela mostra 256
#define VRAM_BG1_FMAP 0x5000 // mapa 64x32 do cenario da luta
#define HP_MAX 96         // 1 ponto = 1 pixel da barra

//---------------------------------------------------------------------------------
// OAM: sprites 16x16 escritos direto no buffer
void oam_put(u16 id, s16 x, s16 y, u16 tile, u8 attr)
{
    u8 *o = &oamMemory[id];
    o[0] = x;
    o[1] = y;
    o[2] = tile;
    o[3] = attr | (tile >> 8);
    if (x < 0)
        oamMemory[512 + (id >> 4)] |= 1 << ((id >> 1) & 6);
}

void oam_begin(void)
{
    u16 *h = (u16 *)&oamMemory[512];
    h[0] = 0; h[1] = 0; h[2] = 0; h[3] = 0; h[4] = 0; h[5] = 0; h[6] = 0; h[7] = 0;
    h[8] = 0; h[9] = 0; h[10] = 0; h[11] = 0; h[12] = 0; h[13] = 0; h[14] = 0; h[15] = 0;
}

void oam_hide_all(void)
{
    u16 i;
    for (i = 0; i < 512; i += 4)
        oamMemory[i + 1] = 240;
    oam_begin();
}

// esconde os sprites de 'from' ate o fim (o que sobrou do quadro anterior)
void oam_hide_from(u16 from)
{
    u16 i;
    for (i = from; i < 128; i++)
        oamMemory[(i << 2) + 1] = 240;
}

//---------------------------------------------------------------------------------
// utilidades das telas
void sfx_pump(void);
extern u8 sfx_k, sfx_n;
void fx_frame(void)
{
    if (sfx_k < sfx_n)
    {
        sfx_pump(); // carga dos sons em pedacos pequenos (2 efeitos por quadro): sem a pausa de antes
        sfx_pump();
    }
    spcProcess(); // fala com o chip de som (efeitos)
    WaitForVBlank();
    wipe_regs();
    REG_CGWSEL = wipe_wsel;
    pad = padsCurrent(0);
    if (game_screen == 3)
        pad = key_map(pad); // na luta: botoes trocados nas Opcoes
    pad_down = pad & ~pad_last;
    pad_last = pad;
    pad2 = padsCurrent(1);
    if (game_screen == 3)
        pad2 = key_map(pad2);
    pad2_down = pad2 & ~pad2_last;
    pad2_last = pad2;
}

//---------------------------------------------------------------------------------
// TARJAS PRETAS da luta (como no SF2: a arena tem 192 linhas): o HDMA escreve no INIDISP, sem gastar CPU: linhas 0-16 e
// 204-261 apagadas (forced blank), 17-203 acesas. O SNES so aceita DMA de graficos com a tela apagada: as tarjas dao ~70
// linhas de tempo de envio por quadro em vez de 37 (so o fim de quadro). Tabela do HDMA na RAM (o brilho dos fades vai nela).
u8 hdma_t[10];
u8 bars_active;

u16 scan_now(void)
{
    u8 lo, hi;
    lo = *(vuint8 *)0x213F; // (zera o flip-flop de leitura)
    lo = *(vuint8 *)0x2137; // trava os contadores
    lo = *(vuint8 *)0x213D; // linha (byte baixo)
    hi = *(vuint8 *)0x213D; // linha (bit 8)
    return lo | ((hi & 1) << 8);
}

// brilho 0-15 (0 = tela apagada); com as tarjas ligadas o HDMA e quem escreve, entao muda-se a tabela
void fx_bright(u8 b)
{
    u8 v = b;
    if (!bars_active)
    {
        setBrightness(b);
        return;
    }
    if (!b)
        v = 0x80;
    hdma_t[3] = v;
    hdma_t[5] = v;
}

void bars_on(void)
{
    u32 a = (u32)(u8 *)hdma_t;
    hdma_t[0] = BAR_ON;
    hdma_t[1] = 0x80;
    hdma_t[2] = 127;
    hdma_t[3] = 15;
    hdma_t[4] = BAR_OFF - BAR_ON - 127;
    hdma_t[5] = 15;
    hdma_t[6] = 1;
    hdma_t[7] = 0x80;
    hdma_t[8] = 0;
    *(vuint8 *)0x4350 = 0x00;          // HDMA modo 0: 1 registrador por entrada
    *(vuint8 *)0x4351 = 0x00;          // $2100 (INIDISP)
    *(vuint8 *)0x4352 = a & 255;
    *(vuint8 *)0x4353 = (a >> 8) & 255;
    *(vuint8 *)0x4354 = 0x7E;           // as variaveis do C ficam no banco $7E (fixram.py)
    bars_active = 1;
    REG_HDMAEN = 0x20;                 // canal 5 (o 7 e do OAM no vblank da PVSnesLib)
}

void bars_off(void)
{
    REG_HDMAEN = 0;
    bars_active = 0;
    setBrightness(15);
}

// espera a linha 'n' do quadro (ou passa direto se ja passou)
void wait_scan(u16 n)
{
    while (scan_now() < n)
        ;
}

// caixa preta: espera cobrir a tela
void cover_screen(u8 reverse)
{
    wipe_start(reverse);
    while (1)
    {
        fx_frame();
        if (wipe_update())
            break;
    }
}

void reveal_screen(void)
{
    while (wipe_phase)
    {
        wipe_update();
        fx_frame();
    }
}

u16 map1[1024], map3[1024];
// fila de envios para a VRAM: montada fora do vblank (o C e lento) e so executada no vblank
#define UP_JOBS 48 // envios na fila (2 por pedaco de ate 8 pecas)
u8 *up_src[UP_JOBS];
u16 up_dst[UP_JOBS], up_sz[UP_JOBS];
u8 up_n, up_used;
u8 sbuf[2];      // lutadores: qual dos 2 blocos da VRAM esta na tela (frames grandes sao enviados em 2 vblanks no outro bloco)
u8 up_t[2], up_ch[2], plan_ch[2]; // frame em envio parcial, pedacos ja enviados, envio de pedaco neste vblank
u8 cam_done;
s16 rb_x0, rb_x1, rb_c;     // posicoes da ultima conta de corpos: se ninguem se mexeu, nada muda
s16 cam, xlo, xhi; // camera (px do mundo no canto esquerdo da tela) e limites dos lutadores (1/8 px)
const u16 zero_word = 0;

void vram_fill0(u16 addr, u16 words)
{
    dmaCopyVram7((u8 *)&zero_word, addr, words << 1, 0x80, 0x1809);
}

void set_color(u8 idx, u16 bgr)
{
    REG_CGADD = idx;
    REG_CGDATA = bgr & 255;
    REG_CGDATA = bgr >> 8;
}

// base comum das telas: modo 1, BG1 e BG3 nos mesmos enderecos
void screen_base(void)
{
    setScreenOff();
    setMode(BG_MODE1, 0x08);
    bgSetGfxPtr(0, VRAM_BG1_GFX);
    bgSetGfxPtr(2, VRAM_BG3_GFX);
    bgSetMapPtr(0, VRAM_BG1_MAP, SC_32x32);
    bgSetMapPtr(2, VRAM_BG3_MAP, SC_32x32);
    bgSetScroll(0, 0, 0);
    bgSetScroll(2, 0, 0);
    oamInitGfxAttr(VRAM_OBJ_GFX, OBJ_SIZE16_L32);
    oam_hide_all();
    memset(map1, 0, 2048);
    memset(map3, 0, 2048);
    vram_fill0(VRAM_BG3_GFX, 0x1000);
    REG_TM = 0x15;
    REG_TS = 0;
    REG_CGADSUB = 0;
    REG_CGWSEL = wipe_wsel;
    set_color(0, 0);
    set_color(1, 0x7FFF); // texto branco (BG3, paleta 0)
}

//---------------------------------------------------------------------------------
// retratos (7x10 tiles) no BG1: p1 = vermelho (olha para a direita), p2 = azul, pal = paleta de BG
#define FACE_TILE_COUNT 70

void face_put(u8 x, u8 y, u8 pal, u8 flip, u8 face)
{
    u8 r, c;
    u16 k, tile;
    for (r = 0; r < FACE_H; r++)
        for (c = 0; c < FACE_W; c++)
        {
            k = ((y + r) << 5) + x + c;
            if (flip)
                tile = r * FACE_W + (FACE_W - 1 - c);
            else
                tile = r * FACE_W + c;
            tile += face * (FACE_W * FACE_H); // retrato do Sagat: tiles logo depois dos do Ryu
            tile |= (pal << 10);
            if (flip)
                tile |= 0x4000;
            map1[k] = tile;
        }
}

// ---- ASSETS do pack: cenario, retratos, HUD e paletas dos lutadores (ids na ordem de tools/mkfight.py: PACK_ASSETS). Tabela no pack: endereco,
// banco, tamanho (u16 cada, 8 bytes por asset). Copia para a VRAM/CGRAM por DMA (sf_vram/sf_cgram) ou para a RAM (sf_copy).
enum { AS_STAGE_BIN, AS_STAGE_MAP, AS_STAGE_PAL, AS_FACE_BIN, AS_FACE_PAL, AS_HUD_BIN, AS_HUD_PAL, AS_HUD2_BIN, AS_RYU_PAL, AS_SAGAT_PAL,
       AS_BOXER_PAL, AS_COUNT };
u16 pk_dst, pk_src, pk_bank, pk_n, pk_db;   // parametros do sf_copy (src/sfcopy.asm); pk_db: 0 = destino no banco $7E, 1 = $7F
u16 asset_tab[AS_COUNT * 4];
u16 fpal[7 * 16];   // paletas dos retratos (CPU: conversao para cinza)
u16 pk_t;
void sf_vram(void);
void sf_cgram(void);

void pk_boot(void);
void pk_vram(u8 id, u16 vdst);
void pk_cgram(u8 id, u16 off, u8 cdst, u16 n);
void pk_ram(u8 id, u16 n);   // destino em pk_dst (nao passar o endereco como argumento: o tcc-816 empilha 4 bytes)

void faces_load(void)
{
    pk_vram(AS_FACE_BIN, VRAM_BG1_GFX);
    pk_dst = (u16)&fpal;
    pk_ram(AS_FACE_PAL, 7 * 32);
    pk_cgram(AS_FACE_PAL, 0, 32, 6 * 16 * 2); // BG paletas 2 (Ryu), 3 (Ryu P2), 4 (cinza), 5 (Sagat), 6 (Sagat P2), 7 (Boxer)
    pk_cgram(AS_FACE_PAL, 6 * 32, 16, 32); // BG paleta 1: Boxer P2 (so nas telas de selecao/VS)
}

//---------------------------------------------------------------------------------
// TELA DE SELECAO DE PERSONAGEM: 8 caixas; Ryu (0) e Sagat (1, ao lado do Ryu) liberados
#define SEL_X0 2   // primeira coluna de tiles
#define SEL_Y0 4   // primeira linha de tiles
#define SEL_Y1 15  // segunda linha de tiles

u8 sel_cell;

void cell_xy(u8 cell, u8 *x, u8 *y)
{
    *x = SEL_X0 + (cell & 3) * 7;
    if (cell & 4)
        *y = SEL_Y1;
    else
        *y = SEL_Y0;
}

void sel_cursor(u8 on)
{
    u8 cx, cy;
    s16 l, t, r, b;
    cell_xy(sel_cell, &cx, &cy);
    l = (cx << 3) - 2;
    t = (cy << 3) - 2;
    r = (cx << 3) + 56 - 14;
    b = (cy << 3) + 80 - 14;
    oam_begin();
    if (!on)
    {
        oam_hide_all();
        return;
    }
    oam_put(0, l, t, 0, 0x30);
    oam_put(4, r, t, 0, 0x30 | 0x40);
    oam_put(8, l, b, 0, 0x30 | 0x80);
    oam_put(12, r, b, 0, 0x30 | 0xC0);
}

void select_build(void)
{
    u8 i, x, y, pal;
    u16 t;
    screen_base();
    faces_load();
    set_color(0, 0x2000); // fundo azul escuro
    for (i = 0; i < 8; i++)
    {
        cell_xy(i, &x, &y);
        pal = 4; // cinza (desabilitado)
        if (i == 0)
            pal = 2; // Ryu colorido
        if (i == 1)
            pal = 5; // Sagat colorido
        if (i == 2)
            pal = 7; // Boxer (avatar de teste)
        face_put(x, y, pal, 0, i < 3 ? i : 0);
    }
    t = fx_text(fx_block_select(), 1, 0, 1, map3, VRAM_BG3_GFX);
    fx_text(fx_block_back(), 26, 0, t, map3, VRAM_BG3_GFX);
    dmaCopyVram((u8 *)map1, VRAM_BG1_MAP, 2048);
    dmaCopyVram((u8 *)map3, VRAM_BG3_MAP, 2048);
    // cursor (canto em L, 16x16) nos chars 0-1 e 16-17 da OBJ; cor 1 do sprite = amarelo
    dmaCopyVram(&cursor_bin, VRAM_OBJ_GFX, 64);
    dmaCopyVram(&cursor_bin + 64, VRAM_OBJ_GFX + 256, 64);
    set_color(129, 0x03FF);
    sel_cell = 0;
    sel_cursor(1);
    setBrightness(15);
}

// escolhe o P1 e depois o P2 (cursor amarelo, depois azul). 1 = escolheu, 0 = voltar para a tela inicial
// Versus: os dois cursores ao mesmo tempo (P1 amarelo no controle 1, P2 azul no controle 2)
u8 vcell[2], vdone[2];

void vs_cursor(u8 p, u8 on)
{
    u8 cx, cy, a = 0x30 | (p << 1);
    u16 o = p << 4;
    s16 l, t, r, b;
    if (!on)
    {
        oamMemory[o + 1] = oamMemory[o + 5] = oamMemory[o + 9] = oamMemory[o + 13] = 240;
        return;
    }
    cell_xy(vcell[p], &cx, &cy);
    l = (cx << 3) - 2 + p * 3; // o P2 um pouco deslocado: os dois cursores juntos continuam visiveis
    t = (cy << 3) - 2 + p * 3;
    r = (cx << 3) + 56 - 14 - p * 3;
    b = (cy << 3) + 80 - 14 - p * 3;
    oam_put(o, l, t, 0, a);
    oam_put(o + 4, r, t, 0, a | 0x40);
    oam_put(o + 8, l, b, 0, a | 0x80);
    oam_put(o + 12, r, b, 0, a | 0xC0);
}

u8 select_versus(void)
{
    u8 p, t = 0;
    u16 d;
    vcell[0] = 0;
    vcell[1] = 1;
    vdone[0] = vdone[1] = 0;
    set_color(145, 0x7EE0); // cursor do P2 (paleta de sprite 1): azul claro
    while (1)
    {
        fx_frame();
        t++;
        oam_begin();
        for (p = 0; p < 2; p++)
        {
            d = pad_down;
            if (p)
                d = pad2_down;
            if (!vdone[p])
            {
                if (d & (KEY_RIGHT | KEY_LEFT | KEY_UP | KEY_DOWN))
                    play_sfx(SFX_MOVE);
                if (d & KEY_RIGHT)
                    vcell[p] = (vcell[p] + 1) & 7;
                else if (d & KEY_LEFT)
                    vcell[p] = (vcell[p] + 7) & 7;
                else if (d & (KEY_UP | KEY_DOWN))
                    vcell[p] ^= 4;
                if ((d & KEY_B) && vcell[p] < 3)
                {
                    play_sfx(SFX_OK);
                    vdone[p] = 1;
                    sel_char[p] = vcell[p];
                }
                else if ((d & KEY_A) && p == 0)
                {
                    play_sfx(SFX_MOVE);
                    cover_screen(1); // P1 com A: volta ao titulo
                    return 0;
                }
                vs_cursor(p, 1);
            }
            else
            {
                if (d & KEY_A)
                {
                    vdone[p] = 0; // desfaz a escolha
                    play_sfx(SFX_MOVE);
                }
                vs_cursor(p, (t >> 2) & 1); // escolhido: pisca
            }
        }
        if (vdone[0] && vdone[1])
        {
            for (t = 0; t < 30; t++)
                fx_frame();
            vs_cursor(0, 1);
            vs_cursor(1, 1);
            cover_screen(0);
            return 1;
        }
    }
}

u8 select_run(void)
{
    u8 t, p;
    game_screen = 1;
    sfx_set_menu(); // sons do cursor e da confirmacao (a luta carrega outros)
    select_build();
    reveal_screen();
    if (game_mode == MODE_VERSUS)
        return select_versus();
    p = 0;
    while (1)
    {
        fx_frame();
        if (pad_down & (KEY_RIGHT | KEY_LEFT | KEY_UP | KEY_DOWN))
            play_sfx(SFX_MOVE); // som do cursor
        if (pad_down & KEY_RIGHT)
            sel_cell = (sel_cell + 1) & 7;
        else if (pad_down & KEY_LEFT)
            sel_cell = (sel_cell + 7) & 7;
        else if (pad_down & (KEY_UP | KEY_DOWN))
            sel_cell ^= 4;
        if ((pad_down & KEY_B) && sel_cell < 3)
        {
            play_sfx(SFX_OK); // confirmou
            sel_char[p] = sel_cell;
            // cursor pisca
            for (t = 0; t < 40; t++)
            {
                sel_cursor((t >> 2) & 1);
                fx_frame();
            }
            if (p == 1 || game_mode == MODE_ARCADE)
            {
                sel_cursor(1);
                cover_screen(0);
                return 1;
            }
            p = 1;
            set_color(129, 0x7EE0); // cursor do P2: azul claro
        }
        else if (pad_down & KEY_A)
        {
            play_sfx(SFX_MOVE);
            if (p == 0)
            {
                cover_screen(1); // A: volta para a tela de titulo
                return 0;
            }
            p = 0; // desfaz a escolha do P1
            set_color(129, 0x03FF);
        }
        sel_cursor(1);
    }
}

//---------------------------------------------------------------------------------
// TELA DE VS: P1 (Ryu original) a esquerda, P2 (paleta alternativa, espelhado) a direita, por 3 segundos
void vs_run(void)
{
    u16 t;
    game_screen = 2;
    screen_base();
    faces_load();
    set_color(0, 0x2000);
    // P1 olhando para a direita, P2 para a esquerda; mesmo personagem dos dois lados: o P2 usa a paleta alternativa
    face_put(4, 9, FTC(sel_char[0], TRK_FACE_PAL), 1, sel_char[0]);
    if (sel_char[0] == sel_char[1])
        face_put(21, 9, FTC(sel_char[1], TRK_FACE_ALT), 0, sel_char[1]);
    else
        face_put(21, 9, FTC(sel_char[1], TRK_FACE_PAL), 0, sel_char[1]);
    fx_text(fx_block_vs(), 10, 0, 1, map3, VRAM_BG3_GFX);
    dmaCopyVram((u8 *)map1, VRAM_BG1_MAP, 2048);
    dmaCopyVram((u8 *)map3, VRAM_BG3_MAP, 2048);
    setBrightness(15);
    reveal_screen();
    for (t = 0; t < 180; t++)
        fx_frame();
    cover_screen(0);
}

//---------------------------------------------------------------------------------
// LUTA
enum { ST_IDLE, ST_WALK, ST_CROUCH, ST_JUMP, ST_ATTACK, ST_HITSTUN, ST_KNOCKDOWN };
enum { KD_AIR, KD_LIE, KD_RISE };

#define GRAV 15            // gravidade da queda de golpes (1/64 px por quadro ao quadrado)
#define GRAV_UP 10         // pulo: sobe mais devagar...
#define GRAV_DN 11         // ...e cai mais rapido (~57 passos = ~48 quadros reais, como no video; ~66 px de altura)
#define JUMP_VY 290
#define WALK_FWD 12        // 1/8 px por quadro (1,5 px)
#define WALK_BACK 10
#define JUMP_VX 15
#define NOATK 255
#define SUPER_DY 18        // super: a magia e desenhada 2 vezes, uma 18 px acima da outra
#define FB_ALT 36          // altura da base da bola de fogo (nasce na altura das maos, como no retangulo da folha)
#define GUARD_T 45         // CPU: quadros em guarda depois de sair da dor/blockstun

// objetos desenhados: 0/1 lutadores, 2/3 bolas de fogo; cada um tem uma faixa de chars na OBJ
// Lutadores: 2 blocos de 96 chars (3 pedacos de 8 pecas = ate 24 pecas) cada; quadros de ate 17 pecas cabem inteiros.
// Bolas, sombras e faisca dividem blocos de 32 chars (4 pecas cada, lado a lado, 8 chars de deslocamento).
const u16 slot_char[7] = {0, 192, 384, 392, 416, 424, 448}; // 6 = faisca de defesa
#define BUF_CH 96        // distancia entre os 2 blocos de um lutador

s16 fx[2];                 // x (pes), 1/8 px
s16 fh[2], fvy[2];         // altura acima do chao (1/64 px) e velocidade vertical
s8 fvx[2];                 // velocidade horizontal no ar (1/8 px)
s16 fkb[2];                // empurrao (1/8 px por quadro, positivo = para a direita)
u8 fstate[2], fdir[2];     // estado e lado (0 = olha para a direita, 1 = esquerda)
u8 fanim[2], fidx[2], ftick[2]; // animacao atual (quadro base), indice e contagem
u8 fcount[2];              // quadros da animacao atual
u8 fwant[7], fshown[7];    // quadro desejado e quadro que esta na VRAM (255 = nenhum)
u8 plan_up[7];             // enviar o quadro novo no proximo vblank
u8 fjump_t[2];             // tempo no ar
u8 fhp[2];
u8 hud_dirty;
u8 fatk[2], fcr[2], fhit[2]; // golpe em andamento, golpe agachado?, ja acertou?
u8 fcan[2]; // o golpe em andamento ja acertou (libera o cancelamento em especial, no 1o ou no 2o hit)
u8 fgauge[2];     // barra de super: px (0..79) da barra atual
u8 fstock[2];     // estoques de super cheios (0..3)
u8 fcounter[2];   // 1 = o golpe em andamento e um Contra-Golpe (derruba sem dano)
u8 hud_dirty2;
u8 fhits[2], fhits_t[2]; // golpes sofridos recentes (cai no limite so com golpe forte); diminui sem apanhar
u8 ai_on;       // 1 = a CPU luta; 0 = P2 parado que so se defende
u8 thr_hold; // 1 = vitima presa no agarrao (a camera e o empurrao entre os corpos ficam parados)
u8 fthrown[2];   // 1 = caindo do agarrao (quica uma vez), 2 = ja quicou; levanta com a animacao rise
u8 flash_t, flash_on, flash_red;
u8 cpu_tech;  // Practice: 1 = a CPU anula o agarrao (anti-throw) sozinha
u8 pg_lock;   // Practice: 1 = barra de super travada no maximo (3 bolinhas)
u8 fsp_lock[2]; // quadros em que a CPU/jogador nao pode soltar outro especial (depois do Shoryuken/Tatsumaki)
u8 frev[2]; // golpe aereo ja feito: roda o pulo ao contrario ate pousar
u8 fstun[2], fkd_ph[2], fkd_t[2], finv[2], fsp_t[2], fsp_n[2];
u8 fcrt[2];                // quadros restantes da transicao em pe -> agachado
u8 fcombo[2], fcombo_air[2]; // golpes seguidos recebidos durante a mesma dor e se o combo comecou no ar
u8 fback[2];               // segurando 'para tras' (guarda): P1 pelo D-Pad, CPU pelo modo de defesa
u8 spark_hit;              // 1 = faisca vermelha de golpe acertado
u8 spark_t;                // faisca de defesa: quadros desde que apareceu (0 = apagada)
s16 spark_x, spark_y;      // posicao da faisca (px de tela)
u8 belt_ref[3];               // altura da faixa preta acima dos pes no quadro de pulo (referencia no ar)
s16 hit_cx, hit_cy;        // ponto de contato (px de tela) do ultimo golpe que acertou
u8 fcpu[2], fguard[2], fblk[2]; // P2 e a CPU: modo de defesa (quadros restantes) e 'esta em blockstun'
u8 fstrong[2];             // golpe forte (soco forte) -> bola de fogo mais rapida
u8 hitstop, round_t;
u8 speed_acc;               // contador do passo extra de logica
u16 down_buf;               // botoes apertados durante o hitstop (valem quando a logica volta)
#define SPEED_EVERY 5       // 1 passo extra a cada 5 quadros = jogo 1,2x mais rapido
u8 dbg_on;                 // debug (botao L): mostra hurtboxes e hitboxes
u16 lag_frames, last_vb, logic_frames, cost_build, cost_frame, cost_t0;
u8 plan_used;
u16 ovr_hist[40], all_hist[40];
u16 busy_h[9], sec_sum[6], sec_avg[6];
s16 lines(u16 a, u16 b)
{
    s16 d = b - a;
    if (d < 0)
        d += 262;
    return d;
}
u16 busy_max, busy_sum, busy_avg, busy_n; // teste de carga: linhas de varredura gastas por quadro
u16 tq0, tq1, tq2, tq3, tq4;
u16 pmax[8], psum[8], pcnt; // PROFILING: maximo e soma (linhas) por trecho
u16 pq0, pq1, pq2, pq3, pq4;
u16 prof_ovr, prof_a, prof_b, prof_c, prof_d, prof_e, prof_f, prof_g; // linha da tela (0-261) no comeco do vblank, apos os sprites e apos o debug
 // quadros que a logica nao coube em 1/60 s (medida para testes)
u8 dir_hist[64], hist_head; // direcoes relativas ao lado (1 cima, 2 baixo, 4 tras, 8 frente): P1 0-31, P2 32-63
u8 fdsw[2], fpal_a[2];
u16 fsw_src[4];  // endereco da paleta das luvas (por jogador e lado), pronto no inicio da luta
u8 fsw_bank[2];      // copia do traco DIRSWAP (usada na parte critica do vblank: mais barato que TR())
u8 bx_dir[2];    // Boxer: lado (fdir) para o qual a paleta das luvas esta ajustada (255 = ainda nao)
u8 fwin[2];     // 1 = lutador fazendo a pose de vitoria
u8 dark_lvl, dark_c; // escurecimento do cenario no Super (0-12 de 31 = ~40%) e contador do fade
u8 slow_skip;
u8 slow_t;      // quadros restantes de camera lenta (golpe final)
u8 hist_hd[2];  // posicao de cada jogador no historico
u16 hist_off;   // historico em uso pelo motion_id (0 ou 32)
u16 cur_keys;   // botoes segurados pelo lutador que esta sendo atualizado
u16 in_k1, in_k2, in_d2, down_buf2; // teclas do P1 e do P2 neste quadro (0 = controles travados)
u8 ctl_on;      // 0 = controles travados (ROUND/FIGHT!, depois do K.O.)
u8 fko[2];      // K.O. de verdade (Arcade/Versus): fica deitado
u8 pj_on[2], pj_t[2];
s16 pj_x[2];               // px
s8 pj_dir[2], pj_spd[2];
u8 pj_dmg[2];
s16 pj_alt[2];             // altura da base da bola (px): Tiger Shot baixo/alto, Hadouken
u8 flow[2];
u8 fsuper[2], pj_super[2], flash_black;
u8 fstock_pre[2]; // bolinhas que o lutador tinha ANTES de comecar o golpe (o +10 do proprio especial nao conta)
u8 fex[2], pj_ex[2];   // magia reforcada (2 socos): o golpe e a magia em voo
u8 pal_pend[2];        // 1 = verde, 2 = vermelha: paleta a carregar no proximo vblank // especial (super): o golpe, a magia em voo e o flash preto                // 1 = o tiro em andamento e o Tiger Shot baixo

//---------------------------------------------------------------------------------
// DADOS DOS GOLPES (tempos em quadros de 1/60 s)
enum { ATK_MP, ATK_HP, ATK_MK, ATK_HK, ATK_CMP, ATK_CHP, ATK_CMK, ATK_CHK, ATK_JP, ATK_JK, ATK_JDK,
       ATK_HADOUKEN, ATK_SHORYU, ATK_TATSU, ATK_CLOSE_HP, ATK_CLOSE_HK, ATK_CLOSE_MK, ATK_CLOSE_MP, ATK_THROW, ATK_COUNT };
#define F_LOW 1   // acerta as pernas (varrida/chute baixo)
#define F_KD 2    // derruba
#define F_MULTI 4 // varios golpes (tatsumaki)
// ---- tabelas dos golpes de CADA lutador: vem do PACK da ROM (tools/sfpack.py, ver docs/FORMAT_SFPK.md) e sao copiadas para a RAM no
// inicio da luta (pk_load_moves). Indice = mvb[jogador] + golpe (P1 = 0, P2 = ATK_COUNT); duracoes: mvb8[jogador] + golpe * 8 + quadro
u8 mv_dmg[2 * ATK_COUNT], mv_stun[2 * ATK_COUNT], mv_hgt[2 * ATK_COUNT], mv_flags[2 * ATK_COUNT];
u8 mv_hs[2 * ATK_COUNT], mv_sw[2 * ATK_COUNT], mv_sh[2 * ATK_COUNT];  // hitstop, som do golpe, som do impacto
u8 mv_dur[2 * ATK_COUNT * 8];
// ---- TRACOS do lutador (vem do pack, 20 palavras depois dos golpes; ver docs/FORMAT_SFPK.md): numeros que antes eram "if (Sagat)" no codigo
u16 ftr[2 * 24];
const u8 trb[2] = {0, 24};
#define TR(i, k) ftr[trb[i] + (k)]
const u8 mvb[2] = {0, ATK_COUNT};
const u8 mvb8[2] = {0, ATK_COUNT * 8};
// ---- tabelas dos QUADROS (hitbox, hurtbox, pedacos 16x16): vem do PACK (tools/sfpack.py) e sao copiadas para a RAM no inicio da luta
// (pk_load_frames). A logica em C e o draw_obj/plan_frames em assembly (acesso longo, $7E:) leem estas tabelas pelo indice do quadro.
extern u8 pf_chunk[], pf_count[], pf_w[], pf_h[], pf_ax[], pf_belt[], pf_hb[], pf_hby0[], pf_hby1[], pf_hu[], pf_huy0[], pf_huy1[], pf_hb2[];
extern u8 pf_hb2y0[], pf_hb2y1[], pp_dx[], pp_dy[], chunk_tab[];   // chunk_tab: por bloco de graficos, endereco (u16), banco, 0
extern s8 pf_hbx0[], pf_hbx1[], pf_hux0[], pf_hux1[], pf_hb2x0[], pf_hb2x1[];
extern u16 pf_off[], pf_first[];
extern u16 smap[];   // mapa do cenario (CPU: o espelho da 2a tela)
// (as tabelas acima ficam em res/sfram.asm, banco $7F; tamanhos PF_N, PP_N, NCHUNK em res/ryu.h)
u16 pk_h[16], pk_dir[25];   // cabecalho do pack e diretorio das tabelas de quadros
u16 pk_o;
void sf_copy(void);

// copia n bytes do pack (deslocamento off, ate 32 KB) para a RAM em pk_dst (o chamador poe o destino em pk_dst: passar o endereco como
// argumento empilhava 4 bytes no tcc-816 e embaralhava os outros argumentos)
void pk_get(u16 off, u16 n)
{
    pk_src = 0x8000 + off;
    pk_bank = 0xA0;      // o pack comeca no banco $A0 (arquivo 0x100000; $20 e o mesmo banco em SlowROM)
    pk_n = n;
    sf_copy();
}

// copia as tabelas de quadros e a tabela de blocos de graficos do pack para a RAM (uma vez por luta; a tela esta coberta)
#define PKA(arr, size) pk_dst = (u16)&arr; pk_get(pk_dir[k++], size)   // (arr em $7F: pk_db = 1)
void pk_load_frames(void)
{
    u8 k = 0;
    pk_dst = (u16)&pk_h;
    pk_get(0, 32);
    pk_dst = (u16)&pk_dir;
    pk_get(pk_h[10], 50);
    pk_db = 1;
    pk_dst = (u16)&chunk_tab;
    pk_get(pk_h[9], NCHUNK * 4);
    PKA(pf_chunk, PF_N);
    PKA(pf_off, PF_N * 2);
    PKA(pf_count, PF_N);
    PKA(pf_w, PF_N);
    PKA(pf_h, PF_N);
    PKA(pf_ax, PF_N);
    PKA(pf_belt, PF_N);
    PKA(pf_hb, PF_N);
    PKA(pf_hbx0, PF_N);
    PKA(pf_hbx1, PF_N);
    PKA(pf_hby0, PF_N);
    PKA(pf_hby1, PF_N);
    PKA(pf_hu, PF_N);
    PKA(pf_hux0, PF_N);
    PKA(pf_hux1, PF_N);
    PKA(pf_huy0, PF_N);
    PKA(pf_huy1, PF_N);
    PKA(pf_hb2, PF_N);
    PKA(pf_hb2x0, PF_N);
    PKA(pf_hb2x1, PF_N);
    PKA(pf_hb2y0, PF_N);
    PKA(pf_hb2y1, PF_N);
    PKA(pf_first, PF_N * 2);
    PKA(pp_dx, PP_N);
    PKA(pp_dy, PP_N);
    pk_db = 0;
}

void pk_boot(void)
{
    pk_dst = (u16)&pk_h;
    pk_get(0, 32);
    pk_dst = (u16)&asset_tab;
    pk_get(pk_h[11], AS_COUNT * 8);
    for (pk_i = 0; pk_i < pk_h[3]; pk_i++)
        for (pk_j = TRK_FACE_PAL; pk_j <= TRK_ARCADE_OPP; pk_j++)
            ftc[(pk_j - TRK_FACE_PAL) * 8 + pk_i] = pk_trait(pk_i, pk_j);
}

// aponta pk_src/pk_bank/pk_n para o asset id (a partir do byte off; n = 0: ate o fim)
void pk_asset(u8 id, u16 off, u16 n)
{
    u8 k = id << 2;
    pk_src = asset_tab[k] + off;
    pk_bank = asset_tab[k + 1];
    pk_n = n;
    if (!n)
        pk_n = asset_tab[k + 2] - off;
}

void pk_vram(u8 id, u16 vdst)
{
    pk_asset(id, 0, 0);
    pk_dst = vdst;
    sf_vram();
}

void pk_cgram(u8 id, u16 off, u8 cdst, u16 n)
{
    pk_asset(id, off, n);
    pk_dst = cdst;
    sf_cgram();
}

void pk_ram(u8 id, u16 n)
{
    pk_asset(id, 0, n);
    sf_copy();
}

// carrega os golpes do lutador ch (indice no pack) para o jogador p
u16 pk_tv;
// um traco de um lutador qualquer (usado nas telas de selecao/VS/game over, fora da luta)
u16 pk_trait(u8 ch, u8 k)
{
    pk_dst = (u16)&pk_o;
    pk_get(pk_h[5] + (ch << 1), 2);
    pk_dst = (u16)&pk_tv;
    pk_get(pk_o + 15 * ATK_COUNT + (k << 1), 2);
    return pk_tv;
}

void pk_load_moves(u8 p, u8 ch)
{
    u8 b = mvb[p];
    pk_dst = (u16)&pk_o;
    pk_get(pk_h[5] + (ch << 1), 2);   // ofs do bloco de golpes deste lutador (pk_h lido por pk_load_frames)
    pk_dst = (u16)&mv_dmg[b];
    pk_get(pk_o, ATK_COUNT);
    pk_dst = (u16)&mv_stun[b];
    pk_get(pk_o + ATK_COUNT, ATK_COUNT);
    pk_dst = (u16)&mv_hgt[b];
    pk_get(pk_o + 2 * ATK_COUNT, ATK_COUNT);
    pk_dst = (u16)&mv_flags[b];
    pk_get(pk_o + 3 * ATK_COUNT, ATK_COUNT);
    pk_dst = (u16)&mv_hs[b];
    pk_get(pk_o + 4 * ATK_COUNT, ATK_COUNT);
    pk_dst = (u16)&mv_sw[b];
    pk_get(pk_o + 5 * ATK_COUNT, ATK_COUNT);
    pk_dst = (u16)&mv_sh[b];
    pk_get(pk_o + 6 * ATK_COUNT, ATK_COUNT);
    pk_dst = (u16)&mv_dur[mvb8[p]];
    pk_get(pk_o + 7 * ATK_COUNT, ATK_COUNT * 8);
    pk_dst = (u16)&ftr[trb[p]];
    pk_get(pk_o + 15 * ATK_COUNT, 48);   // tracos
}

const u8 atk_base[ATK_COUNT] = {A_MP, A_HP, A_MK, A_HK, A_CMP, A_CHP, A_CMK, A_CHK, A_JP, A_JK, A_JDK,
                                A_HADOUKEN, A_SHORYU, A_TATSU, A_HPC, A_HKC, A_MKC, A_MPC, A_THROW};
const u8 atk_n[ATK_COUNT] = {A_MP_N, A_HP_N, A_MK_N, A_HK_N, A_CMP_N, A_CHP_N, A_CMK_N, A_CHK_N, A_JP_N,
                             A_JK_N, A_JDK_N, A_HADOUKEN_N, A_SHORYU_N, A_TATSU_N, A_HPC_N, A_HKC_N, A_MKC_N, A_MPC_N, A_THROW_N};
// golpes no ar: sequencia (quadro da animacao, duracao). Estende o membro (hitbox so nesse quadro) e logo recolhe,
// voltando ao quadro anterior ate pousar (255 = fica). Indice = (golpe - ATK_JP) * 4 + passo
const u8 jseq_f[12] = {0, 1, 0, 0,   0, 1, 2, 1,   0, 1, 0, 0};
const u8 jseq_d[12] = {3, 12, 255, 0, 3, 3, 12, 255, 3, 12, 255, 0};
#define HGT_MID 0    // defende em pe ou agachado
#define HGT_LOW 1    // so defende agachado (baixa)
#define HGT_HIGH 2   // so defende em pe (alta): golpes de pulo

//---------------------------------------------------------------------------------
// animacao
void set_anim(u8 i, u8 base, u8 count, u8 dur)
{
    if (fanim[i] == base && fcount[i] == count)
        return;
    fanim[i] = base;
    fcount[i] = count;
    fidx[i] = 0;
    ftick[i] = dur;
}

// forca a animacao a recomecar do zero
void play_anim(u8 i, u8 base, u8 count, u8 dur)
{
    fanim[i] = base;
    fcount[i] = count;
    fidx[i] = 0;
    ftick[i] = dur;
}

// avanca a animacao em loop (dur quadros por pedaco); 'once' = para no ultimo
u8 fpp[2];                                    // DonLee: posicao no vai-e-volta do andar
u8 fdash[2];                                  // backdash em andamento (quadros restantes)
s8 fdv[2];                                    // velocidade do backdash (1/8 px por quadro)
u8 fhop[2], tap_d[2];                         // pulinho (dois toques): em andamento, lado do ultimo toque
u16 gclk, tap_at[2], hop_at[2];               // relogio de quadros da luta; quando foi o ultimo toque e o ultimo pulinho
const u8 pp_seq[8] = {0, 1, 2, 3, 4, 3, 2, 1};

void anim_step(u8 i, u8 dur, u8 once)
{
    if (ftick[i])
        ftick[i]--;
    if (ftick[i])
        return;
    ftick[i] = dur;
    if (fidx[i] + 1 < fcount[i])
        fidx[i]++;
    else if (!once)
        fidx[i] = 0;
}

void fight_gfx_init(void)
{
    u8 i, j, k;
    screen_base();
    pk_vram(AS_STAGE_BIN, VRAM_BG1_GFX);
    pk_dst = (u16)&smap;
    pk_db = 1;
    pk_ram(AS_STAGE_MAP, 2048);
    pk_db = 0;
    // cenario 64x32: a segunda tela e o espelho da primeira (sem emenda visivel)
    for (k = 0; k < 32; k++)
        for (j = 0; j < 32; j++)
            map1[(k << 5) + 31 - j] = smap[(k << 5) + j] ^ 0x4000;
    bgSetMapPtr(0, VRAM_BG1_FMAP, SC_64x32);
    dmaCopyVram((u8 *)smap, VRAM_BG1_FMAP, 2048);
    dmaCopyVram((u8 *)map1, VRAM_BG1_FMAP + 0x400, 2048);
    pk_cgram(AS_STAGE_PAL, 0, 32, 6 * 16 * 2); // BG paletas 2-7: cenario
    pk_vram(AS_HUD_BIN, VRAM_BG3_GFX);
    bgSetGfxPtr(1, VRAM_BG2_GFX);
    bgSetMapPtr(1, VRAM_BG2_MAP, SC_32x32);
    bgSetScroll(1, 0, 0);
    vram_fill0(VRAM_BG2_MAP, 0x400);
    pk_vram(AS_HUD2_BIN, VRAM_BG2_GFX);
    set_color(17, 0);          // BG2 paleta 1: cor 1 = preto
    set_color(18, 0x0C38);     // cor 2 = vermelho (dano pendente)
    REG_TM = 0x17;             // BG1, BG2, BG3, OBJ
    dmaCopyVram(&dbg_bin, VRAM_BG3_GFX + (DBG_TILE0 << 3), (&dbg_bin_end - &dbg_bin)); // contornos do debug
    pk_cgram(AS_HUD_PAL, 0, 0, 24); // paleta 0 = barras de vida; paleta 2 (indice 8) = barra de super
    set_color(5, 0x03E0);  // BG3 paleta 1 (debug): cor 1 = verde (hurtbox)
    set_color(6, 0x001F);  // cor 2 = vermelho (hitbox)
    set_color(7, 0x001F);  // cor 3 (hurtbox e hitbox no mesmo pixel) = vermelho
    pk_cgram(AS_RYU_PAL, 0, 128, 5 * 16 * 2); // OBJ paletas 0 (P1), 1 (P2), 2 (bola de fogo), 3 (sombra), 4 (faisca)
    // paleta de cada lutador pelo personagem; o mesmo personagem dos dois lados: o P2 usa a alternativa
    for (i = 0; i < 2; i++)
    {
        k = 0;
        if (i == 1 && fgfx[0] == fgfx[1])
            k = TR(i, TRK_PAL_ALT);
        pk_cgram(TR(i, TRK_PAL_ASSET), k, 128 + (i << 4), 32); // (DonLee: o lado das luvas e ajustado no loop: bx_dir)
    }
    pk_cgram(AS_SAGAT_PAL, 64, 208, 32); // OBJ paleta 5: Tiger Shot
    // OBJ paletas 6 (P1) e 7 (P2): magia especial do jogador (verde = super, vermelha = 2 socos), carregada no
    // vblank quando ele atira (cada jogador so tem uma magia na tela)
    pal_pend[0] = pal_pend[1] = 0;
    bx_dir[0] = bx_dir[1] = 255;
    for (i = 0; i < 7; i++)
    {
        fshown[i] = 255;
        fwant[i] = 255;
    }
    for (i = 0; i < 2; i++)
    {
        sbuf[i] = 0;
        up_n = 0;
        up_used = 0;
        up_t[i] = 255;
        plan_ch[i] = 0;
    }
    belt_ref[0] = pf_h[A_JUMP + choff[0]] - pf_belt[A_JUMP + choff[0]];
    belt_ref[1] = pf_h[A_JUMP + choff[1]] - pf_belt[A_JUMP + choff[1]];
}

// barra de energia de 12 tiles na linha 2: p = 0 (P1, esvazia pela esquerda) ou 1 (P2, pela direita)
// barras do HUD: so os tiles que mudam entre o valor antigo e o novo sao reescritos (cada acerto redesenhava as 3
// barras inteiras: ~200 linhas de tela). m = tile do centro (o primeiro a encher), dir = +1/-1, n = tiles,
// t0 = tile vazio (t0 + k = k px cheios)
u8 bar_hp_old[2], bar_g_old[2], bar_st_old[2];
u16 hud2_row[32];  // linha 2 do mapa do BG2 (barra vermelha)
u8 hud2_dirty, rv[2], rdelay[2]; // barra vermelha: valor mostrado e quadros ate comecar a descer

void bar_upd(u16 *m, s8 dir, u8 n, u8 oldv, u8 newv, u16 t0)
{
    u8 t, hi;
    s16 v;
    t = newv >> 3;
    hi = oldv >> 3;
    if (oldv < newv)
    {
        t = oldv >> 3;
        hi = newv >> 3;
    }
    if (hi >= n)
        hi = n - 1;
    if (t > hi)
        return;
    if (dir > 0)
        m += t;
    else
        m -= t;
    v = newv - (t << 3);
    while (t <= hi)
    {
        if (v <= 0)
            *m = t0;
        else if (v >= 8)
            *m = t0 + 8;
        else
            *m = t0 + v;
        m += dir;
        v -= 8;
        t++;
    }
}

// barra vermelha (dano pendente): fica no valor antigo ~300 ms e depois desce suave ate a amarela
void red_draw(u8 p, u8 nv)
{
    if (p == 0)
        bar_upd(&hud2_row[13], -1, 12, rv[0], nv, 10 | 0x400 | PRIO);
    else
        bar_upd(&hud2_row[18], 1, 12, rv[1], nv, 1 | 0x400 | PRIO);
    rv[p] = nv;
    hud2_dirty = 1;
}

void red_update(void)
{
    u8 p, d;
    for (p = 0; p < 2; p++)
    {
        if (rv[p] < fhp[p])
            red_draw(p, fhp[p]);     // vida subiu (fake K.O. do Practice): a vermelha acompanha na hora
        else if (rv[p] > fhp[p])
        {
            if (rdelay[p])
                rdelay[p]--;
            else
            {
                d = (rv[p] - fhp[p] + 7) >> 3;   // descida suave (lerp: 1/8 da diferenca por quadro)
                red_draw(p, rv[p] - d);
            }
        }
    }
}

void draw_bar(u8 p, u8 hp)
{
    if (p == 0)
        bar_upd(&map3[(HUD_HP << 5) + 13], -1, 12, bar_hp_old[0], hp, 10 | PRIO);
    else
        bar_upd(&map3[(HUD_HP << 5) + 18], 1, 12, bar_hp_old[1], hp, 1 | PRIO);
    bar_hp_old[p] = hp;
    hud_dirty = 1;
}

// barra de super (linhas 26-27 do BG3, discreta): P1 embaixo a esquerda (enche do centro para a borda), P2 a direita.
// 100 pontos = 1 estoque; as bolinhas (ate 3) ficam na linha de cima, no canto
void draw_super(u8 p)
{
    u8 j;
    u16 k;
    if (p == 0)
        bar_upd(&map3[((HUD_SP + 1) << 5) + 8], -1, 8, bar_g_old[0], fgauge[0], 28 | PRIO | 0x800);
    else
        bar_upd(&map3[((HUD_SP + 1) << 5) + 23], 1, 8, bar_g_old[1], fgauge[1], 19 | PRIO | 0x800);
    bar_g_old[p] = fgauge[p];
    if (bar_st_old[p] != fstock[p])
    {
        bar_st_old[p] = fstock[p];
        k = (HUD_SP << 5) + 1;
        if (p)
            k = (HUD_SP << 5) + 28;
        for (j = 0; j < 3; j++)
            map3[k + j] = (37 + (fstock[p] > j)) | PRIO | 0x800;
    }
    hud_dirty2 = 1;
}

// redesenha a barra de super inteira (inicio da luta e depois do debug apagar a linha)
void super_full(u8 p)
{
    u8 g = fgauge[p];
    // 1o: apaga a barra toda (valor 0); 2o: desenha do comeco (centro) ate o valor. Antes so desenhava do valor para fora e,
    // se a barra ja estava vazia (troca de round com barra guardada), o preenchimento comecava no meio
    fgauge[p] = 0;
    bar_g_old[p] = 255;
    bar_st_old[p] = 255;
    draw_super(p);
    fgauge[p] = g;
    draw_super(p);
}

// ganha energia de super (atacar, apanhar, soltar especial)
void gain_g(u8 p, u8 n)
{
    if (fstock[p] >= 3)
        return;
    fgauge[p] += n;
    if (fgauge[p] >= 64)
    {
        fgauge[p] -= 64;
        fstock[p]++;
        if (fstock[p] >= 3)
            fgauge[p] = 0;
    }
    draw_super(p);
}

void fighters_reset(void)
{
    u8 i;
    fx[0] = 136 * 8;   // largada mais afastada (112 px): ninguem acerta no primeiro quadro
    fx[1] = 248 * 8;
    cam = 64;
    cam_done = 0;
    fsp_lock[0] = fsp_lock[1] = 0;
    fthrown[0] = fthrown[1] = 0;
    thr_hold = 0;
    fhits[0] = fhits[1] = 0;
    fhits_t[0] = fhits_t[1] = 0;
    fgauge[0] = fgauge[1] = 0;
    fstock[0] = fstock[1] = 0;
    fcounter[0] = fcounter[1] = 0;
    super_full(0);
    super_full(1);
    rb_x0 = rb_x1 = -1;
    xlo = 80 << 3;
    xhi = 304 << 3;
    for (i = 0; i < 2; i++)
    {
        fh[i] = 0;
        fvy[i] = 0;
        fvx[i] = 0;
        fkb[i] = 0;
        fstate[i] = ST_IDLE;
        fanim[i] = 255;
        fcount[i] = 0;
        fidx[i] = 0;
        ftick[i] = 1;
        fjump_t[i] = 0;
        fhp[i] = HP_MAX;
        fatk[i] = NOATK;
        fcr[i] = 0;
        fhit[i] = 0;
        fstun[i] = 0;
        fkd_ph[i] = 0;
        fkd_t[i] = 0;
        finv[i] = 0;
        fsp_t[i] = 0;
        fsp_n[i] = 0;
        fcrt[i] = 0;
        fguard[i] = 0;
        fblk[i] = 0;
        fstrong[i] = 0;
        pj_on[i] = 0;
        pj_t[i] = 0;
        fwant[2 + i] = 255;
        fwant[4 + i] = 255;
        fback[i] = 0;
        fcombo[i] = 0;
        fcombo_air[i] = 0;
    }
    fwant[6] = 255;
    spark_t = 0;
    for (i = 0; i < 64; i++)
        dir_hist[i] = 0;
    hist_head = 0;
    hist_hd[0] = hist_hd[1] = 0;
    fko[0] = fko[1] = 0;
    fwin[0] = fwin[1] = 0;
    hitstop = 0;
    speed_acc = 0;
    down_buf = 0;
    round_t = 0;
    fcpu[0] = 0;
    fcpu[1] = 1;
    if (game_mode == MODE_VERSUS)
        fcpu[1] = 0; // P2 e o 2o jogador
    fdir[0] = 0;
    fdir[1] = 1;
    set_anim(0, A_IDLE, A_IDLE_N, 7);
    set_anim(1, A_IDLE, A_IDLE_N, 7);
    bar_hp_old[0] = bar_hp_old[1] = 0; // 0 -> cheia: desenha a barra inteira
    draw_bar(0, HP_MAX);
    draw_bar(1, HP_MAX);
    rv[0] = rv[1] = 0;
    rdelay[0] = rdelay[1] = 0;
    red_draw(0, HP_MAX);
    red_draw(1, HP_MAX);
}

// vira o lutador para o oponente (so quando esta no chao)
void face_opponent(u8 i)
{
    u8 o = i ^ 1;
    if (fstate[o] == ST_JUMP && fh[o] > 0)
        return; // cross-up: quem esta sendo sobrevoado so vira depois que o outro pousa
    if (fx[i] < fx[o])
        fdir[i] = 0;
    else if (fx[i] > fx[o])
        fdir[i] = 1;
}

//---------------------------------------------------------------------------------
// comandos: direcoes do P1 relativas ao lado em que ele olha, guardadas em um anel de 32 quadros
// comandos de especial (assembly, src/drawobj.asm): 0 = baixo, baixo-frente, frente; 1 = baixo, baixo-tras, tras;
// 2 = frente, baixo-frente (Shoryuken); 3 = frente, baixo-frente, frente (atalho)
u8 motion_id(u8 id);
void clear_fwd_hist(void);

u8 rel_dir(u8 i, u16 keys)
{
    u8 d = 0;
    if (keys & KEY_UP)
        d |= 1;
    if (keys & KEY_DOWN)
        d |= 2;
    if (fdir[i])
    {
        if (keys & KEY_LEFT)
            d |= 8;
        if (keys & KEY_RIGHT)
            d |= 4;
    }
    else
    {
        if (keys & KEY_RIGHT)
            d |= 8;
        if (keys & KEY_LEFT)
            d |= 4;
    }
    return d;
}

enum { M_D, M_DF, M_DB, M_F, M_B };


// k1 -> k2 -> k3: o ultimo passo nos ultimos 12 quadros e o comando inteiro em ate 24 (tolerancia do buffer)

// Shoryuken (para frente, baixo, baixo+frente + soco), com tolerancia: o passo final (baixo+frente) vale ate 15 quadros
// atras, o 'para frente' inicial pode ser qualquer direcao com frente (nao precisa ser puro) e o 'baixo' do meio e
// opcional (quem desliza o direcional de frente direto para a diagonal tambem faz)


// atalho de arcade: frente, diagonal baixo-frente, frente + soco

//---------------------------------------------------------------------------------
// caixas: alturas em px acima do chao. regiao 0 = cabeca, 1 = tronco, 2 = pernas
// altura (px) da base do quadro f do lutador i acima do chao. No ar a posicao vertical segue a faixa preta
// (o corpo), nao os pes: assim o soco/chute no ar nao "desce" quando o quadro tem as pernas encolhidas.
s16 fbase(u8 i, u8 f)
{
    s16 b = fh[i] >> 6;
    u16 rf = f + choff[i];
    if (fstate[i] == ST_JUMP && pf_belt[rf] != 255)
        b += belt_ref[i] - (pf_h[rf] - pf_belt[rf]);
    return b;
}

// Hurtboxes: cada quadro da folha tem a sua (retangulo verde, pf_hu*). Sem ela (agachar, defesa, dor...) valem 3
// variacoes padrao: EM PE, AGACHADO e PULANDO.
u8 is_crouching(u8 i)
{
    if (fstate[i] == ST_ATTACK && fatk[i] == ATK_CHP && fidx[i] >= 1)
        return 0; // o gancho agachado fica de pe
    if (fstate[i] == ST_CROUCH)
        return 1;
    if ((fstate[i] == ST_ATTACK || fstate[i] == ST_HITSTUN) && fcr[i])
        return 1;
    return 0;
}

u8 hurt_frame(u8 d)
{
    u8 f;
    if (fanim[d] == 255)
        return 255;
    f = fanim[d] + fidx[d];
    if (pf_hu[f + choff[d]])
        return f;
    return 255;
}

void hurt_x(u8 d, s16 *x0, s16 *x1)
{
    u8 f = hurt_frame(d);
    s16 ax = fx[d] >> 3, hw = 17;
    u16 rf = f + choff[d];
    if (f != 255)
    {
        if (fdir[d])
        {
            *x0 = ax - pf_hux1[rf];
            *x1 = ax - pf_hux0[rf];
        }
        else
        {
            *x0 = ax + pf_hux0[rf];
            *x1 = ax + pf_hux1[rf];
        }
        return;
    }
    if (fstate[d] == ST_JUMP)
        hw = 16;
    *x0 = ax - hw;
    *x1 = ax + hw;
}

// regioes (r: 0 cabeca, 1 tronco, 2 pernas) a partir de baixo/topo da hurtbox
void hurt_split(u8 r, s16 bot, s16 top, s16 *y0, s16 *y1)
{
    s16 lg = bot + (((top - bot) * 3) >> 3), hd = top - 20;
    if (r == 0)
    {
        *y0 = hd;
        *y1 = top;
    }
    else if (r == 1)
    {
        *y0 = lg;
        *y1 = hd;
    }
    else
    {
        *y0 = bot;
        *y1 = lg;
    }
}

void hurt_y(u8 d, u8 r, s16 *y0, s16 *y1)
{
    u8 f = hurt_frame(d);
    s16 base;
    if (f != 255)
    {
        base = fbase(d, fanim[d] + fidx[d]);
        hurt_split(r, base + pf_huy0[f + choff[d]], base + pf_huy1[f + choff[d]], y0, y1);
        return;
    }
    base = fh[d] >> 6;
    if (is_crouching(d))
        hurt_split(r, base, base + 60, y0, y1);
    else if (fstate[d] == ST_JUMP)
        hurt_split(r, base + 12, base + 91, y0, y1);
    else
        hurt_split(r, base, base + 81, y0, y1);
}

// defesa (P1: segurando 'para tras'; CPU: modo de guarda): golpe baixo exige defesa agachada, golpe alto (pulo)
// exige defesa em pe e o golpe medio vale para as duas
u8 can_block(u8 d, u8 hgt)
{
    u8 crouching = 0;
    if (!fback[d])
        return 0;       // so defende quem segura 'para tras'
    if (fstate[d] != ST_IDLE && fstate[d] != ST_CROUCH && fstate[d] != ST_WALK && !(fstate[d] == ST_HITSTUN && fblk[d]))
        return 0;       // no chao e fora de golpe/dor (sem defesa aerea)
    if (fstate[d] == ST_CROUCH || fcr[d])
        crouching = 1;
    if (hgt == HGT_LOW && !crouching)
        return 0;       // baixo: so a defesa agachada protege
    if (hgt == HGT_HIGH && crouching)
        return 0;       // alto (golpe de pulo): so a defesa em pe protege
    return 1;
}

// toca o efeito id com o volume das opcoes
// tom de cada efeito (mesmos tons de tools/mksfx.py: taxa = 4044 Hz x tom)
//                          LIGHT..LANDING = 2; HADOUKEN = 3; SHORYU, TATSU, MOVE = 2
const u8 sfx_tom[SFX_COUNT] = {2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
                               2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2}; // vozes graves/longas (resultado, contagem) e o grito no tom 1

// O SNESMOD so toca 16 efeitos (o indice vai em 4 bits): cada tela carrega so os que usa. sfx_slot[id] = posicao do
// efeito id no SPC (255 = nao carregado). spcLoad do modulo quase vazio zera a memoria de efeitos do SPC.
u8 sfx_slot[SFX_COUNT];
u8 sfx_list[16], sfx_n;

void sfx_add(u8 id)
{
    if (sfx_n < 16)
        sfx_list[sfx_n++] = id;
}

u8 sfx_k, sfx_async; // efeitos ja enviados ao SPC; 1 = a carga so comeca (o resto vai 1 efeito por quadro, em fx_frame)

void sfx_pump(void)
{
    if (sfx_k < sfx_n)
    {
        spcLoadEffect(sfx_list[sfx_k]);
        sfx_slot[sfx_list[sfx_k]] = sfx_k;
        sfx_k++;
    }
}

void sfx_load(void)
{
    u8 k;
    spcStop();
    spcLoad(MOD_EMPTY);
    for (k = 0; k < SFX_COUNT; k++)
        sfx_slot[k] = 255;
    sfx_k = 0;
    if (!sfx_async)
        while (sfx_k < sfx_n)
            sfx_pump();
}

// conjuntos so de voz do anunciante (cada um troca o conteudo do SPC: so com a tela coberta ou numa pausa)
void sfx_set_voices(u8 which)
{
    u8 k;
    sfx_cur = 3 + which;
    sfx_n = 0;
    if (which == 0)
    {
        sfx_add(SFX_V_ROUND);
        sfx_add(SFX_V_ONE);
        sfx_add(SFX_V_TWO);
        sfx_add(SFX_V_THREE);
        sfx_add(SFX_V_FIGHT);
    }
    else if (which == 1)
    {
        sfx_add(SFX_V_WIN);
        sfx_add(SFX_V_LOSE);
        sfx_add(SFX_V_PERFECT);
    }
    else
    {
        for (k = SFX_V_C9; k <= SFX_V_C1; k++)
            sfx_add(k);
        sfx_add(SFX_KO);
        sfx_add(SFX_MOVE);
        sfx_add(SFX_OK);
    }
    sfx_load();
}

void sfx_set_menu(void)
{
    if (sfx_cur == 1)
        return; // ja carregados (titulo <-> selecao)
    sfx_cur = 1;
    sfx_n = 0;
    sfx_add(SFX_JAB); // teste do volume nas Opcoes
    sfx_add(SFX_MOVE);
    sfx_add(SFX_OK);
    sfx_load();
}

// pausa: o som do PAUSE (e o cursor do menu de treino) ocupa o SPC por um instante; ao voltar a luta recarrega o conjunto dela
void sfx_set_pause(void)
{
    sfx_cur = 6;
    sfx_n = 0;
    sfx_add(SFX_PAUSE);
    sfx_add(SFX_MOVE);
    sfx_load();
}

// luta: golpes e impactos + as vozes dos personagens que estao na luta. Ryu x Sagat passa de 16: o swing medio usa o
// fraco e a aterrissagem usa o som de cair no chao
void sfx_set_fight(u8 c0, u8 c1)
{
    u8 k, ryu = (c0 == 0 || c1 == 0), sag = (c0 == 1 || c1 == 1);
    sfx_cur = 2;
    sfx_n = 0;
    for (k = SFX_LIGHT; k <= SFX_LANDING; k++)
    {
        if (ryu && sag && (k == SFX_MEDIUM || k == SFX_LANDING || k == SFX_FORWARD))
            continue;
        sfx_add(k);
    }
    sfx_add(SFX_KO); // grito de morte (na hora em que a vida zera)
    if (ryu)
    {
        sfx_add(SFX_HADOUKEN);
        sfx_add(SFX_SHORYU);
        sfx_add(SFX_TATSU);
    }
    if (sag)
    {
        sfx_add(SFX_TIGER);
        sfx_add(SFX_TIGERUP);
    }
    sfx_load();
}

void play_sfx(u8 id)
{
    u8 s;
    // SFX_NONE (255) = golpe sem som (Hadouken, arremesso). A comparacao com 255 falha no compilador e o jogo pedia ao
    // SPC um efeito inexistente (tom/slot lixo = o "passarinho" agudo ao soltar magia ou arremesso): so vale id valido
    if (id & 0xC0) // (ids validos sao < 64; por bits porque o tcc-816 compara u8 >= 128 como negativo)
        return;
    if (id >= SFX_COUNT || !sfx_lv)
        return;
    s = sfx_slot[id];
    if (s == 255)
    {
        if (id == SFX_FORWARD)
            s = sfx_slot[SFX_ROUNDHOUSE];
        else if (id == SFX_MEDIUM)
            s = sfx_slot[SFX_LIGHT];
        else if (id == SFX_LANDING)
            s = sfx_slot[SFX_GROUND];
        if (s == 255)
            return;
    }
    spcEffect(sfx_tom[id], s, sfx_hw);
}


// golpe acertado: faisca vermelha no ponto de contato e som de pancada (snd = efeito do golpe)
void hit_fx(u8 snd)
{
    play_sfx(snd);
    spark_t = 1;
    spark_hit = 1;
    spark_x = hit_cx;
    spark_y = hit_cy;
}

// o golpe/bola de fogo do atacante a foi defendido por d: sem dano, so blockstun e recuo (maior que no acerto)
void block_hit(u8 a, u8 d, u8 stun, u8 pushback)
{
    u8 cr = 0;
    if (fstate[d] == ST_CROUCH || fcr[d])
        cr = 1;
    fblk[d] = 1;
    gain_g(d, 1); // golpe defendido: +1
    fstate[d] = ST_HITSTUN;
    fstun[d] = stun;
    fatk[d] = NOATK;
    fcr[d] = cr;
    if (fx[a] > fx[d])
        fkb[d] = -14;
    else
        fkb[d] = 14;
    if (cr)
        play_anim(d, A_BLOCK_C, A_BLOCK_C_N, 255);
    else
        play_anim(d, A_BLOCK, A_BLOCK_N, 255);
    fsp_t[d] = 255;
    // som metalico de defesa (volume das opcoes) e faisca no ponto onde a hitbox encostou na hurtbox
    play_sfx(SFX_BLOCKED);
    spark_t = 1;
    spark_hit = 0;
    spark_x = hit_cx;
    spark_y = hit_cy;
    if (pushback)
    {
        // o atacante tambem recua (mais ainda quando o golpe e defendido)
        if (fx[a] < fx[d])
            fkb[a] = -pushback;
        else
            fkb[a] = pushback;
    }
}

// aplica o dano e a barra
// dano do golpe id do atacante a: as versoes medias de Tatsumaki e Shoryuken sao mais fracas que as fortes
u8 dmg_of(u8 a, u8 id)
{
    u8 d = mv_dmg[mvb[a] + id];
    if (!fstrong[a])
    {
        if (id == ATK_TATSU)
            d -= 1;
        else if (id == ATK_SHORYU)
            d -= 3;
    }
    return d;
}

// aplica o dano na barra. Se zerar: "fake K.O." -- a barra volta a 100% na hora e a funcao devolve 1
// (o chamador derruba o lutador; depois ele levanta e a luta continua)
u8 damage(u8 d, u8 dmg)
{
    u8 ko = 0;
    if (fhp[d] > dmg)
        fhp[d] -= dmg;
    else if (game_mode != MODE_PRACTICE)
    {
        fhp[d] = 0; // K.O. de verdade: cai e fica no chao
        fko[d] = 1;
        ko = 1;
    }
    else
    {
        fhp[d] = HP_MAX;
        ko = 1;
    }
    if (ko)
    {
        play_sfx(SFX_KO); // o lutador grita ao cair
        if (game_mode != MODE_PRACTICE)
            slow_t = 100; // golpe final: camera lenta (1/4 da velocidade) por ~1,7 s
    }
    draw_bar(d, fhp[d]);
    rdelay[d] = 30; // a barra vermelha espera ~500 ms antes de comecar a descer
    gain_g(d, 1); // apanhar: +1
    return ko;
}

// derruba o oponente d (atacante a): arco para tras e fica no chao
void knockdown(u8 d, u8 a, s16 vy)
{
    fstate[d] = ST_KNOCKDOWN;
    fkd_ph[d] = KD_AIR;
    fkd_t[d] = 0;
    fvy[d] = vy;
    if (fh[d] < 64)
        fh[d] = 64;     // acertado no ar: cai de onde esta
    fatk[d] = NOATK;
    fcr[d] = 0;
    fvx[d] = 14;
    if (fx[a] > fx[d])
        fvx[d] = -14;   // cai para longe de quem bateu
    play_anim(d, A_FALL, A_FALL_N, 255);
    fidx[d] = 0;
    finv[d] = 0;
}

// reacao de dor: regiao 0 cabeca, 1 tronco (em pe) ou agachado
void hitstun(u8 d, u8 a, u8 region, u8 stun)
{
    u8 n, dur;
    if (fh[d] > 0)
    {
        // acertado no ar (pulo, descida do Shoryuken, giro do Tatsumaki): cai. Antes ficava parado la em cima na dor
        // e voltava ao parado flutuando (a bola de fogo saia da altura do chao)
        knockdown(d, a, 120);
        return;
    }
    stun += stun >> 2; // reacao de dor mais lenta e mais longa (da tempo de encaixar combos)
    fstate[d] = ST_HITSTUN;
    fblk[d] = 0;
    fstun[d] = stun;
    fatk[d] = NOATK;
    fkb[d] = 16;
    if (fx[a] > fx[d])
        fkb[d] = -16;
    if (is_crouching(d))
    {
        fcr[d] = 1;
        n = A_HIT_CROUCH_N;
        play_anim(d, A_HIT_CROUCH, n, 1);
    }
    else
    {
        fcr[d] = 0;
        if (region == 0)
        {
            n = A_HIT_HEAD_N;
            play_anim(d, A_HIT_HEAD, n, 1);
        }
        else
        {
            n = A_HIT_BODY_N;
            play_anim(d, A_HIT_BODY, n, 1);
        }
    }
    dur = stun / n;
    ftick[d] = dur;
    fsp_t[d] = dur; // duracao de cada quadro da dor
}

// limite de golpes sofridos: chegando nele, so um golpe forte derruba (golpe fraco nunca derruba)
#define HITS_LIMIT 4
#define HITS_DECAY 30 // quadros sem apanhar para tirar 1 do contador
u8 is_strong(u8 id)
{
    return id == ATK_HP || id == ATK_HK || id == ATK_CHP || id == ATK_CHK || id == ATK_CLOSE_HP ||
           id == ATK_CLOSE_HK || id == ATK_SHORYU || id == ATK_TATSU || id == ATK_HADOUKEN;
}

// o ataque id do lutador a acertou o d: calcula regiao e reacao
void apply_hit(u8 a, u8 d, u8 id, u8 region)
{
    u8 fl = mv_flags[mvb[a] + id], cbonus, rc;
    fhit[a] = 1;
    fcan[a] = 1;
    if (fcounter[a])
    {
        // Contra-Golpe: derruba sem dano (nao e defendido)
        hitstop = 12;     // hitstop 25% maior
        flash_t = 2;      // flash branco na tela toda
        hit_fx(SFX_STRONG);
        knockdown(d, a, 340);
        fvx[d] += fvx[d] >> 1; // 50% mais longe que a derrubada normal
        return;
    }
    // hitstop: congela os dois lutadores; o recuo so vale depois (golpes fortes congelam mais). Vem da tabela do lutador
    hitstop = mv_hs[mvb[a] + id];
    if (can_block(d, mv_hgt[mvb[a] + id]))
    {
        block_hit(a, d, 14 + (mv_stun[mvb[a] + id] >> 1), 16);
        return;
    }
    if (id != ATK_SHORYU && id != ATK_TATSU && id != ATK_HADOUKEN)
        gain_g(a, 3); // golpe normal que acerta: +3 (so quem acerta)
    hit_fx(mv_sh[mvb[a] + id]);
    // atacante recua um pouco quando acerta (so golpes parados no chao): evita encadear sem folga
    if (fstate[a] == ST_ATTACK && id != ATK_TATSU && id != ATK_SHORYU && id != ATK_CLOSE_HP &&
        !(id == ATK_CLOSE_HK && !fsp_n[a]))
    {
        rc = 12;
        if (id == ATK_CLOSE_HK)
            rc = 6;
        if (fx[a] < fx[d])
            fkb[a] = -rc;
        else
            fkb[a] = rc;
    }
    // combo: golpe que acerta quem ja esta em dor encadeia (a dor de cada golpe seguinte e um pouco maior)
    if (fstate[d] == ST_HITSTUN && !fblk[d])
    {
        if (fcombo[d] < 255)
            fcombo[d]++;
    }
    else
    {
        fcombo[d] = 1;
        fcombo_air[d] = 0;
        if (fstate[a] == ST_JUMP)
            fcombo_air[d] = 1;
    }
    cbonus = 0;
    if (fcombo[d] > 1)
    {
        cbonus = (fcombo[d] - 1) * 3;
        if (cbonus > 9)
            cbonus = 9;
    }
    if (damage(d, dmg_of(a, id)))
    {
        knockdown(d, a, 340); // barra zerou: queda pesada (a barra ja voltou a 100%)
        return;
    }
    // combo iniciado no ar que termina em especial ou numa sequencia de acertos derruba
    if (fhits[d] < 255)
        fhits[d]++;
    fhits_t[d] = 0;
    if ((fcombo_air[d] && fcombo[d] >= 2 && (id == ATK_SHORYU || id == ATK_TATSU)) ||
        (fhits[d] >= HITS_LIMIT && is_strong(id)))
    {
        fhits[d] = 0;
        knockdown(d, a, 300);
        return;
    }
    if (fl & F_KD)
    {
        if (id == ATK_SHORYU)
            knockdown(d, a, 380);
        else
            knockdown(d, a, 220);
        return;
    }
    if (id == ATK_TATSU && fsp_n[a] >= 2)
    {
        knockdown(d, a, 260);
        return;
    }
    hitstun(d, a, region, mv_stun[mvb[a] + id] + cbonus);
    // golpes de perto: o forte de soco quase nao empurra (da para cancelar no Hadouken), o de chute afasta bem
    if (id == ATK_CLOSE_HP || id == ATK_CLOSE_HK)
    {
        rc = 3;
        if (id == ATK_CLOSE_HK)
        {
            if (fsp_n[a])
            {
                rc = 24; // so o 2o golpe empurra
                // oponente no canto (parede): quem empurra recua no lugar, senao da para encurralar so repetindo o golpe
                if (fx[d] <= xlo + 48 || fx[d] >= xhi - 48)
                    fkb[a] = fx[a] < fx[d] ? -rc : rc;
            }
            fsp_n[a]++;
        }
        if (fx[a] < fx[d])
            fkb[d] = rc;
        else
            fkb[d] = -rc;
    }
}

// retangulo do golpe x hurtboxes do oponente. Devolve a regiao atingida (0-2) ou 255

// hitbox ativa do lutador a neste quadro (px de tela; y = altura acima do chao). Os golpes comuns usam o
// retangulo vermelho desenhado na folha para o quadro da animacao; Shoryuken/Tatsumaki usam as tabelas.
u8 get_hitbox(u8 a, s16 *x0, s16 *x1, s16 *y0, s16 *y1, u8 n)
{
    u8 id = fatk[a], f;
    u16 rf;
    s16 ax, base, hx0, hx1, hy0, hy1;
    if (id == NOATK || id == ATK_HADOUKEN)
        return 0;
    ax = fx[a] >> 3;
    f = fanim[a] + fidx[a];
    rf = f + choff[a];
    if (n)
    {
        if (!pf_hb2[rf])
            return 0;
        hx0 = pf_hb2x0[rf];
        hx1 = pf_hb2x1[rf];
        hy0 = pf_hb2y0[rf];
        hy1 = pf_hb2y1[rf];
    }
    else
    {
        if (!pf_hb[rf])
            return 0;
        hx0 = pf_hbx0[rf];
        hx1 = pf_hbx1[rf];
        hy0 = pf_hby0[rf];
        hy1 = pf_hby1[rf];
        if (id == ATK_CLOSE_HK && fidx[a] == 0 && !fchar[a])
        {
            // 1o golpe do chute forte de perto: a perna sobe na frente do corpo (a caixa da folha so cobre o pe,
            // acima da cabeca do oponente, e nao acertava)
            hx0 = 10;
            hx1 = 40;
            hy0 = 50;
            hy1 = 100;
        }
    }
    if (fdir[a])
    {
        *x0 = ax - hx1;
        *x1 = ax - hx0;
    }
    else
    {
        *x0 = ax + hx0;
        *x1 = ax + hx1;
    }
    base = fbase(a, f);
    *y0 = base + hy0;
    *y1 = base + hy1;
    return 1;
}

// base e topo da hurtbox do lutador d (px acima do chao): a do quadro, ou a variacao padrao (em pe/agachado/pulo)
void hurt_bt(u8 d, s16 *bot, s16 *top)
{
    u8 f = hurt_frame(d);
    s16 base;
    u16 rf;
    if (f != 255)
    {
        base = fbase(d, f);
        rf = f + choff[d];
        *bot = base + pf_huy0[rf];
        *top = base + pf_huy1[rf];
        return;
    }
    base = fh[d] >> 6;
    *bot = base;
    if (is_crouching(d))
        *top = base + 60;
    else if (fstate[d] == ST_JUMP)
    {
        *bot = base + 12;
        *top = base + 91;
    }
    else
        *top = base + 81;
}

// regiao acertada (0 cabeca, 1 tronco, 2 pernas: so golpes baixos) ou 255. A hurtbox e calculada uma vez so
// (antes: uma vez por regiao) e as regioes saem dela: pernas ate 3/8 da altura, cabeca nos 20 px de cima
u8 hit_region(s16 ax0, s16 ax1, s16 ay0, s16 ay1, u8 d, u8 low)
{
    s16 dx0, dx1, bot, top, lg, hd, y0, y1;
    u8 r;
    hurt_x(d, &dx0, &dx1);
    if (ax1 < dx0 || ax0 > dx1)
        return 255;
    hurt_bt(d, &bot, &top);
    if (ay1 < bot || ay0 > top)
        return 255;
    lg = bot + (((top - bot) * 3) >> 3);
    hd = top - 20;
    if (ay1 >= hd)
    {
        r = 0;
        y0 = hd;
        y1 = top;
    }
    else if (ay1 >= lg && ay0 <= hd)
    {
        r = 1;
        y0 = lg;
        y1 = hd;
    }
    else if (low && ay0 <= lg)
    {
        r = 2;
        y0 = bot;
        y1 = lg;
    }
    else
        return 255;
    // ponto de contato: centro da area onde a hitbox encosta na hurtbox (para a faisca)
    if (ax0 < dx0)
        ax0 = dx0;
    if (ax1 > dx1)
        ax1 = dx1;
    if (ay0 < y0)
        ay0 = y0;
    if (ay1 > y1)
        ay1 = y1;
    hit_cx = (ax0 + ax1) >> 1;
    hit_cy = GROUND_Y - ((ay0 + ay1) >> 1);
    return r;
}

// confere o golpe em andamento do lutador a (uma vez por quadro, nos quadros ativos)
void check_hit(u8 a)
{
    u8 id = fatk[a], d = a ^ 1, r, low;
    s16 x0, x1, y0, y1;
    if (id == NOATK || fhit[a])
        return;
    if (fstate[d] == ST_KNOCKDOWN || finv[d])
        return;
    low = mv_flags[mvb[a] + id] & F_LOW;
    r = 255;
    if (get_hitbox(a, &x0, &x1, &y0, &y1, 0))
        r = hit_region(x0, x1, y0, y1, d, low);
    if (r == 255 && get_hitbox(a, &x0, &x1, &y0, &y1, 1))
        r = hit_region(x0, x1, y0, y1, d, low); // segunda caixa do quadro (se houver)
    if (r == 255)
        return;
    apply_hit(a, d, id, r);
}

//---------------------------------------------------------------------------------
// bola de fogo
void spawn_fireball(u8 i)
{
    if (pj_on[i])
        return;
    pj_on[i] = 1;
    pj_t[i] = 0;
    play_sfx(TR(i, TRK_FB_SFX));
    if (fdir[i])
    {
        pj_dir[i] = -1;
        pj_x[i] = (fx[i] >> 3) - 40;
    }
    else
    {
        pj_dir[i] = 1;
        pj_x[i] = (fx[i] >> 3) + 40;
    }
    // colado no oponente: a bola nasce dentro dele (ou depois dele) e acerta no mesmo quadro
    {
        s16 ox = fx[i ^ 1] >> 3, dxo = ox - (fx[i] >> 3);
        if (pj_dir[i] < 0)
            dxo = -dxo;
        if (dxo > 0 && dxo <= 56)
            pj_x[i] = ox - pj_dir[i] * pf_hbx1[A_FIREBALL + choff[i]];
    }
    // soco medio: velocidade intermediaria (o fraco seria 3 e o forte 5)
    if (fstrong[i])
    {
        pj_spd[i] = 5;
        pj_dmg[i] = 14;
    }
    else
    {
        pj_spd[i] = 4;
        pj_dmg[i] = 11;
    }
    fwant[2 + i] = A_FIREBALL;
    pj_super[i] = fsuper[i];
    pj_ex[i] = fex[i];
    if (fsuper[i])
    {
        pj_spd[i] = 4;
        pj_dmg[i] = HP_MAX * 2 / 5; // 40% da vida
        pal_pend[i] = 1;
    }
    else if (fex[i])
    {
        pj_spd[i] = 5;
        pj_dmg[i] = 20;   // forte normal: 14
        pal_pend[i] = 2;
    }
    pj_alt[i] = TR(i, TRK_FB_ALT_HI);    // altura da magia (Sagat: Tiger Shot alto ou baixo = rasteiro)
    if (flow[i])
        pj_alt[i] = TR(i, TRK_FB_ALT_LO);
}

void proj_update(void)
{
    u8 i, d, r, chain;
    s16 y0, y1, x0, x1;
    if (pj_on[0] == 1 && pj_on[1] == 1)
    {
        // duas bolas de fogo se chocam: as duas se desfazem
        x0 = pj_x[0] - pj_x[1];
        if (x0 < 0)
            x0 = -x0;
        if (x0 <= 24)
        {
            // a mais forte (2 socos > simples; super > todas) atravessa; forcas iguais: as duas se desfazem
            u8 p0 = pj_super[0] ? 2 : pj_ex[0], p1 = pj_super[1] ? 2 : pj_ex[1];
            play_sfx(SFX_STRONG);
            for (i = 0; i < 2; i++)
            {
                if ((i == 0 && p0 > p1) || (i == 1 && p1 > p0))
                    continue;
                pj_on[i] = 2;
                pj_t[i] = 0;
                fwant[2 + i] = A_FIREBALL_FX;
            }
        }
    }
    for (i = 0; i < 2; i++)
    {
        if (!pj_on[i])
            continue;
        if (pj_on[i] == 2)
        {
            // a bola se desfazendo: explosao, circulo branco e lascas azuis
            pj_t[i]++;
            if (pj_t[i] < 3)
                fwant[2 + i] = A_FIREBALL_FX;
            else if (pj_t[i] < 6)
                fwant[2 + i] = A_FIREBALL_FX + 1;
            else if (pj_t[i] < 8)
                fwant[2 + i] = A_FIREBALL_FX + 2;
            else if (pj_t[i] < 10)
                fwant[2 + i] = A_FIREBALL_FX + 3;
            else
            {
                pj_on[i] = 0;
                fwant[2 + i] = 255;
            }
            continue;
        }
        pj_x[i] += pj_dir[i] * pj_spd[i];
        if (pj_x[i] < cam - 24 || pj_x[i] > cam + 280)
        {
            pj_on[i] = 0;
            fwant[2 + i] = 255;
            continue;
        }
        d = i ^ 1;
        if (fstate[d] == ST_KNOCKDOWN || finv[d])
            continue;
        if (pj_dir[i] < 0)
        {
            x0 = pj_x[i] - pf_hbx1[A_FIREBALL + choff[i]];
            x1 = pj_x[i] - pf_hbx0[A_FIREBALL + choff[i]];
        }
        else
        {
            x0 = pj_x[i] + pf_hbx0[A_FIREBALL + choff[i]];
            x1 = pj_x[i] + pf_hbx1[A_FIREBALL + choff[i]];
        }
        y0 = pj_alt[i] + pf_hby0[A_FIREBALL + choff[i]];
        y1 = pj_alt[i] + pf_hby1[A_FIREBALL + choff[i]];
        if (pj_super[i])
            y1 += SUPER_DY; // magia alta: 2 andares
        r = hit_region(x0, x1, y0, y1, d, 0);
        if (r != 255 && can_block(d, HGT_MID))
        {
            block_hit(i, d, 16, 0);
            hitstop = 6;
            pj_on[i] = 2;
            pj_t[i] = 0;
            fwant[2 + i] = A_FIREBALL_FX;
        }
        else if (r != 255)
        {
            hitstop = 6;
            hit_fx(SFX_STRONG);
            chain = 0;
            if (fstate[d] == ST_HITSTUN && !fblk[d])
                chain = 1;
            if (!chain)
            {
                fcombo[d] = 0;
                fcombo_air[d] = 0;
            }
            fcombo[d]++;
            if (fhits[d] < 255)
                fhits[d]++;
            fhits_t[d] = 0;
            if (damage(d, pj_dmg[i]))
                knockdown(d, i, 340);
            else if (pj_super[i])
            {
                hitstop = 20;   // impacto maior
                knockdown(d, i, 320);
            }
            else if (fhits[d] >= HITS_LIMIT)
            {
                fhits[d] = 0;
                knockdown(d, i, 300);
            }
            else if (fcombo_air[d] && chain)
                knockdown(d, i, 300); // combo iniciado no ar que termina no especial: derruba
            else
                hitstun(d, i, r, 18 + (chain << 3));
            pj_on[i] = 2;
            pj_t[i] = 0;
            fwant[2 + i] = A_FIREBALL_FX;
        }
    }
}

//---------------------------------------------------------------------------------
// backdash (dois toques para tras, como no KOF 95): salto baixo (4 px) e rapido para tras, sem golpes no ar; so de novo depois da espera. Para frente: desligado (HOP_FORWARD)
#define HOP_VY 70     // sobe so uns 4 px (1/64 px por quadro)
#define HOP_VX 34     // ~65 px de distancia em ~15 quadros
#define HOP_WAIT 45   // quadros: nao da para encadear
#define HOP_FORWARD 0 // 1 = liga o pulinho para frente (dois toques para frente); desligado por enquanto
void start_hop(u8 i, s8 dir)
{
    fstate[i] = ST_JUMP;
    fvy[i] = HOP_VY;
    fvx[i] = dir * HOP_VX;
    fjump_t[i] = 0;
    fatk[i] = NOATK;
    fhit[i] = 0;
    fcr[i] = 0;
    fhop[i] = 1;
    hop_at[i] = gclk;
    tap_d[i] = 0;
    set_anim(i, A_WALKB, A_WALKB_N, 255);
    frev[i] = 0;
}

#define DASH_WIN 18   // quadros maximos entre os dois toques

void start_jump(u8 i, s8 dir)
{
    fstate[i] = ST_JUMP;
    fvy[i] = TR(i, TRK_JUMP_VY);   // forca do pulo (Sagat: o quadro encolhido sobe 28 px, Ryu 15: pulo mais baixo para os pes chegarem na mesma altura)
    fvx[i] = dir * JUMP_VX;
    fjump_t[i] = 0;
    fatk[i] = NOATK;
    fhit[i] = 0;
    if (dir)
        set_anim(i, A_FJUMP, A_FJUMP_N, 255);
    else
        set_anim(i, A_JUMP, A_JUMP_N, 255);
    frev[i] = 0;
}

// duracao do quadro k do golpe id do lutador i (tabela do PACK; o 255 = fica ate pousar)
u8 adur(u8 i, u8 id, u8 k)
{
    return mv_dur[mvb8[i] + (id << 3) + k];
}

void start_attack(u8 i, u8 id)
{
    fatk[i] = id;
    fhit[i] = 0;
    fsp_t[i] = 0;
    fsp_n[i] = 0;
    frev[i] = 0;
    fcan[i] = 0;
    fkb[i] = 0;
    fcounter[i] = 0;
    fstock_pre[i] = fstock[i];
    if (id == ATK_HADOUKEN || id == ATK_SHORYU || id == ATK_TATSU)
        gain_g(i, 10); // soltar especial (mesmo no vento): +10
    flow[i] = 0;
    fsuper[i] = 0;
    fex[i] = 0;
    play_anim(i, atk_base[id], atk_n[id], adur(i, id, 0));
    if (fchar[i] && id == ATK_SHORYU)
        play_sfx(SFX_TIGERUP); // "Tiger Uppercut!"
    else if (fchar[i] && id == ATK_TATSU)
        play_sfx(SFX_TIGER);   // Tiger Knee
    else
        play_sfx(mv_sw[mvb[i] + id]);
    if (fstate[i] != ST_JUMP)
        fstate[i] = ST_ATTACK;
}

u8 close_range(u8 i);

// Contra-Golpe (Y + X durante a defesa, gasta 1 estoque): soco forte invulneravel que derruba sem dano
void do_counter(u8 i)
{
    fstock[i]--;
    fgauge[i] = 0;
    draw_super(i);
    fblk[i] = 0;
    fcr[i] = 0;
    fstun[i] = 0;
    fkb[i] = 0;
    face_opponent(i);
    start_attack(i, ATK_HP);
    fcounter[i] = 1;
    finv[i] = 24;
    hit_fx(SFX_HARD2);
}

// agarrao: L + direcao do oponente, colados, os dois no chao. O oponente fica preso na reacao de dor ate o quadro do
// arremesso; ai leva o dano e cai (derrubada)
#define THROW_DIST 36
u8 throw_ok(u8 i, u16 keys)
{
    u8 d = i ^ 1;
    u16 want = KEY_LEFT;
    s16 dist = (fx[i] - fx[d]) >> 3;
    if (fx[d] > fx[i])
        want = KEY_RIGHT;
    if (dist < 0)
        dist = -dist;
    if (!(keys & want) || dist > THROW_DIST || fh[i] || fh[d] || finv[d])
        return 0;
    return fstate[d] == ST_IDLE || fstate[d] == ST_WALK || fstate[d] == ST_CROUCH || fstate[d] == ST_ATTACK;
}

void throw_break(u8 a, u8 d);
u8 ai_rnd(void);
void start_throw(u8 i)
{
    u8 d = i ^ 1;
    face_opponent(i);
    start_attack(i, ATK_THROW);
    fcr[i] = 0;
    // o P2 e agarrado: preso nos quadros de arremesso (A_THROWN), sem recuo
    fstate[d] = ST_HITSTUN;
    fblk[d] = 0;
    fatk[d] = NOATK;
    fcr[d] = 0;
    fkb[d] = 0;
    fstun[d] = 60;
    play_anim(d, A_THROWN, A_THROWN_N, 255);
    fsp_t[d] = 255;
    if (fcpu[d] && ai_on && cpu_tech)
    {
        // CPU com Anti-Throw: anula na hora (Practice: sempre; Arcade: 3 de 4 vezes)
        if (cpu_tech == 1 || (ai_rnd() & 3))
            throw_break(i, d);
    }
}


// anti-throw: o defensor aperta um botao de ataque na janela do agarrao e o arremesso e anulado. Ninguem leva dano; hitstop,
// flash vermelho, os dois com a reacao de dor na cabeca e empurrados para tras como o golpe forte de perto (chute, 24)
void throw_break(u8 a, u8 d)
{
    u8 x, o;
    for (x = 0; x < 2; x++)
    {
        o = x ^ 1;
        fstate[x] = ST_HITSTUN;
        fblk[x] = 0;
        fatk[x] = NOATK;
        fcr[x] = 0;
        fh[x] = 0;
        fvx[x] = 0;
        fvy[x] = 0;
        finv[x] = 0;
        fstun[x] = 24;
        fkb[x] = 24;
        if (fx[x] < fx[o])
            fkb[x] = -24;
        play_anim(x, A_HIT_HEAD, A_HIT_HEAD_N, 1);
        ftick[x] = 24 / A_HIT_HEAD_N;
        fsp_t[x] = ftick[x];
    }
    thr_hold = 0;
    hitstop = 14;
    flash_t = 4;
    flash_red = 1;
    hit_fx(SFX_STRONG);
}

// posicao da vitima em relacao ao Ryu, fase a fase (video de referencia, 60 quadros/s): agarrada na frente,
// puxada para as costas (baixa, depois alta), deitada por cima da cabeca, de cabeca para baixo na frente (impacto) e
// arremessada. Fases: 0 = quadro 0 do Ryu, 1 = quadro 1, 2/3 = 1a/2a metade do quadro 2, 4 = quadro 3
// Por quem arremessa: [0] Ryu (puxa para as costas, passa por cima e joga para a FRENTE) e [1] Sagat (agarra na
// frente, levanta, gira de costas (quadro 79 da folha) e joga para TRAS dele (quadro 80))
const s16 thr_off[2][5] = {{20, -12, -8, 0, 22}, {24, 20, 2, -14, -36}};          // px a frente (negativo = atras)
// Sagat: levanta a vitima na altura das maos erguidas (78), passa por cima da cabeca (79) e joga para tras e para
// baixo (80, bracos estendidos para tras)
const s16 thr_hgt[2][5] = {{0, 300, 1600, 2800, 2600}, {0, 2600, 4000, 3600, 1400}}; // altura (1/64 px)
const u8 thr_fr[2][5] = {{0, 1, 1, 2, 3}, {0, 1, 2, 2, 3}};                       // quadro da animacao thrown
const u8 thr_back[2][5] = {{0, 1, 1, 0, 0}, {0, 0, 0, 1, 1}};                     // 1 = olha para o mesmo lado de quem joga

void throw_update(u8 i)
{
    u8 d = i ^ 1, k = fidx[i], ph, c = fchar[i];
    s16 sg = 1, nx;
    if (fdir[i])
        sg = -1;
    if (k < 4 && fsp_t[i] < 2)
    {
        ph = k;
        if (k == 2 && ftick[i] <= 12)
            ph = 3;
        else if (k == 3)
            ph = 4;
        thr_hold = 1;
        fstate[d] = ST_HITSTUN;
        fstun[d] = 60;
        finv[d] = 2;
        fidx[d] = thr_fr[c][ph];
        fdir[d] = fdir[i] ^ 1;
        if (thr_back[c][ph])
            fdir[d] = fdir[i];
        fh[d] = thr_hgt[c][ph];
        nx = fx[i] + sg * thr_off[c][ph] * 8;
        if (nx < 128)
            nx = 128;
        if (nx > 2944)
            nx = 2944;
        fx[d] = nx;
        if (ph == 4 && !fsp_t[i])
        {
            // impacto: dano e faisca (a vitima ainda fica de cabeca para baixo ate o proximo quadro do Ryu)
            fsp_t[i] = 1;
            gain_g(i, 3); // o dano e o som vem quando a vitima bate no chao
        }
    }
    else if (fsp_t[i] == 1)
    {
        // solta: voa a distancia de uma derrubada pesada; no video o Ken fica parado no alto ~30 quadros (pausa)
        fsp_t[i] = 2;
        thr_hold = 0;
        finv[d] = 0;
        knockdown(d, i, 150); // sai quase reto (no video nao sobe muito) e mais rapido para o lado
        fvx[d] = sg * 20;     // ~ a distancia de uma derrubada pesada
        if (c)
            fvx[d] = -sg * 20; // Sagat: joga para tras dele
        fthrown[d] = 1;   // sem pausa no ar: no meio da tela a vitima voa direto (a pausa era do video no canto)
    }
}

// magia com 2 socos (fraco + forte juntos): reforcada, vermelha, mais dano; flash branco para avisar
void ex_check(u8 i)
{
    if ((cur_keys & KEY_B) && (cur_keys & KEY_Y))
    {
        if (game_mode != MODE_PRACTICE)
        {
            if (!fstock_pre[i])
                return; // sem bolinha ANTES do golpe: sai a magia normal (a barra parcial nao conta)
            fstock[i]--; // Arcade/Versus: o golpe duplo gasta 1 bolinha
            draw_super(i);
        }
        fex[i] = 1;
        flash_t = 2;
    }
}

// Sagat: Tiger Uppercut (frente, baixo, diagonal + soco), Tiger Knee (o mesmo + chute), Tiger Shot alto
// (baixo, diagonal, frente + soco) e baixo (o mesmo + chute). Usam os golpes do Ryu (Shoryuken, Tatsumaki, Hadouken)
u8 sagat_special(u8 i, u8 punch, u8 kick)
{
    s8 sg = 1;
    if (fdir[i])
        sg = -1;
    if (motion_id(2) || motion_id(3))
    {
        fcr[i] = 0;
        if (punch)
        {
            // Tiger Uppercut: a mesma fisica do Shoryuken
            start_attack(i, ATK_SHORYU);
            fvy[i] = 207;              // mesma altura de antes (290 com gravidade 17), mas com gravidade 9: mais tempo no ar
            if (!fstrong[i])
                fvy[i] = 178;
            fh[i] = 64;
            fvx[i] = 5;
            if (fdir[i])
                fvx[i] = -5;
            finv[i] = 10;
            return 1;
        }
        // Tiger Knee: agacha 3 passos no chao e salta em diagonal com a joelhada (o forte vai mais longe e mais alto)
        start_attack(i, ATK_TATSU);
        fvy[i] = 360;             // ~46 px de salto (imagem de referencia: no alto, o topo do quadro do joelho fica na
        fvx[i] = sg * 14;         // altura da cabeca do Sagat em pe); ~50 px para a frente (o forte ~65 px)
        if (fstrong[i])
        {
            fvy[i] = 375;
            fvx[i] = sg * 17;
        }
        return 1;
    }
    if (motion_id(0))
    {
        fcr[i] = 0;
        start_attack(i, ATK_HADOUKEN);
        if (punch)
            ex_check(i);
        if (kick)
        {
            // Tiger Shot baixo: animacao agachada, o tiro sai rasteiro
            flow[i] = 1;
            play_anim(i, A_LOW_SHOT, A_LOW_SHOT_N, mv_dur[mvb8[i] + (ATK_HADOUKEN << 3)]);
        }
        return 1;
    }
    return 0;
}

// golpe especial (devolve 1 se comecou)
u8 try_special(u8 i, u16 down)
{
    u8 punch = 0, kick = 0;
    if (fcpu[i] || fsp_lock[i])
        return 0; // a CPU solta os especiais direto (ai_think); o historico de direcoes e do jogador 1
    if (down & (KEY_B | KEY_Y))
        punch = 1;
    if (down & (KEY_A | KEY_X))
        kick = 1;
    if (!punch && !kick)
        return 0;
    fstrong[i] = 0;
    if (down & (KEY_Y | KEY_X))
        fstrong[i] = 1;
    if ((down & KEY_Y) && (game_mode == MODE_PRACTICE || fstock[i] >= 3) && motion_id(4))
    {
        if (game_mode != MODE_PRACTICE)
        {
            fstock[i] = 0; // Arcade/Versus: o Super gasta as 3 bolinhas e zera a barra
            fgauge[i] = 0;
            draw_super(i);
        }
        // SUPER: baixo, diagonal, frente duas vezes + soco forte: tela pisca em preto, tudo congela e sai uma magia
        // verde, alta (desenhada em 2 andares), que tira 40% da vida
        fcr[i] = 0;
        fstrong[i] = 0;
        start_attack(i, ATK_HADOUKEN);
        if (game_mode != MODE_PRACTICE)
        {
            fstock[i] = 0; // (de novo: o +10 do start_attack nao pode sobrar na barra do Super)
            fgauge[i] = 0;
            draw_super(i);
        }
        fsuper[i] = 1;
        dark_lvl = 12;
        dark_c = 0;
        flash_t = 6;
        flash_black = 1;
        hitstop = 16;
        return 1;
    }
    if (fchar[i])
        return sagat_special(i, punch, kick);
    if (punch && (motion_id(2) || motion_id(3)))
    {
        fcr[i] = 0;
        start_attack(i, ATK_SHORYU);
        fvy[i] = 350;              // HP: video de referencia (~56 px, 34 quadros no ar, gravidade 17)
        if (!fstrong[i])
            fvy[i] = 310;          // LP: mais baixo e rapido (~32 px, ~25 quadros, gravidade 25)
        fh[i] = 64;
        fvx[i] = 5;      // trajetoria quase vertical (antes: -10 olhando para a esquerda, o dobro do outro lado)
        if (fdir[i])
            fvx[i] = -5;
        finv[i] = 10;
        return 1;
    }
    if (punch && motion_id(0))
    {
        fcr[i] = 0;
        start_attack(i, ATK_HADOUKEN);
        ex_check(i);
        return 1;
    }
    if (kick && motion_id(1))
    {
        fcr[i] = 0;
        start_attack(i, ATK_TATSU);
        return 1;
    }
    return 0;
}

// golpe normal pelo botao apertado (no chao)
// colados: golpes fortes em pe viram os golpes de perto (Close)
#define CLOSE_DIST 44
u8 close_range(u8 i)
{
    s16 d = (fx[i] - fx[i ^ 1]) >> 3;
    if (d < 0)
        d = -d;
    return d <= CLOSE_DIST && !fh[i ^ 1];
}

u8 try_normal(u8 i, u16 down, u8 crouch)
{
    if (crouch)
        clear_fwd_hist(); // golpe agachado: o 'frente' anterior nao vale para o Shoryuken (Soco agachado -> Hadouken)
    u8 id = NOATK;
    if (crouch)
    {
        if (down & KEY_B)
            id = ATK_CMP;
        else if (down & KEY_Y)
            id = ATK_CHP;
        else if (down & KEY_A)
            id = ATK_CMK;
        else if (down & KEY_X)
            id = ATK_CHK;
    }
    else
    {
        if (down & KEY_B)
            id = ATK_MP;
        else if (down & KEY_Y)
        {
            id = ATK_HP;
            if (close_range(i))
            {
                id = ATK_CLOSE_HP;
                if (TR(i, TRK_HP_CLOSE_HK))
                    id = ATK_CLOSE_HK; // DonLee: o HP de perto usa a arte do HK de perto
            }
        }
        else if (down & KEY_A)
        {
            id = ATK_MK;
            if (close_range(i))
                id = ATK_CLOSE_MK;
        }
        else if (down & KEY_X)
        {
            id = ATK_HK;
            if (close_range(i))
                id = ATK_CLOSE_HK;
        }
    }
    if (id == NOATK)
        return 0;
    fcr[i] = crouch;
    start_attack(i, id);
    return 1;
}

// volta ao chao: agachado se o D-Pad ainda segura baixo, senao parado (ja com a animacao certa: sem piscar)
void land_state(u8 i, u16 keys)
{
    fatk[i] = NOATK;
    fhit[i] = 0;
    fcombo[i] = 0;
    fcombo_air[i] = 0;
    if (keys & KEY_DOWN)
    {
        fstate[i] = ST_CROUCH;
        fcr[i] = 1;
        fcrt[i] = 0;
        play_anim(i, A_CROUCH, A_CROUCH_N, 255);
    }
    else
    {
        fstate[i] = ST_IDLE;
        fcr[i] = 0;
        play_anim(i, A_IDLE, A_IDLE_N, 7);
    }
}

// logica do golpe em andamento (no chao)
void attack_update(u8 i, u16 keys, u16 down)
{
    u8 id = fatk[i], dur;
    s8 sg = 1;
    s16 spd, nx, dnow, dnew;
    if (fdir[i])
        sg = -1;
    if (id == ATK_SHORYU)
    {
        // sobe com invencibilidade, desce e fica vulneravel ao pousar
        if (finv[i])
            finv[i]--;
        fx[i] += fvx[i];
        if (fsp_t[i] < 250)
            fsp_t[i]++;
        if (fh[i] > 0 || fvy[i] > 0)
        {
            fh[i] += fvy[i];
            if (fchar[i])
                fvy[i] -= fstrong[i] ? 9 : 13; // Tiger Uppercut: gravidade menor = ~40% mais tempo no ar (mesma altura)
            else
            {
                fvy[i] -= 25;
                if (fstrong[i])
                    fvy[i] += 8; // HP: gravidade 17 (sobe e cai mais devagar, igual ao video)
            }
            if (fchar[i])
            {
                // Tiger Uppercut: sobe (1 = 85, 2 = 86 com o soco no alto) e desce com a cambalhota para tras:
                // 3 = 81 encolhido, 4 = 87 girando, 5 = 88 de bracos para cima ate o chao
                if (fvy[i] > 150)
                    fidx[i] = 1;
                else if (fvy[i] > 0)
                    fidx[i] = 2;
                else if (fvy[i] > -65)
                    fidx[i] = 3;
                else if (fvy[i] > -135)
                    fidx[i] = 4;
                else
                    fidx[i] = 5;
            }
            else if (fvy[i] > 250)
                fidx[i] = 2;
            else if (fvy[i] > 0)
                fidx[i] = 3;
            else
                fidx[i] = 4; // depois do contato o quadro nao muda mais ate pousar
            if (fh[i] <= 0)
            {
                // tocou o chao: o golpe acaba na hora
                fsp_lock[i] = 30;   // recuperacao: sem outro especial logo em seguida
                fh[i] = 0;
                fvy[i] = 0;
                fvx[i] = 0;
                land_state(i, keys);
                return;
            }
        }
        else
            land_state(i, keys);
        check_hit(i);
        return;
    }
    if (id == ATK_TATSU && fchar[i])
    {
        // Tiger Knee: agacha (quadro 0) no chao, salta com a joelhada (quadros 1-2, hitbox da folha) ate o alto,
        // recolhe na descida (3) e pousa (4)
        if (!fsp_n[i])
        {
            fidx[i] = 0;
            if (++fsp_t[i] >= 3)
            {
                fsp_n[i] = 1;
                fh[i] = 64;
                fidx[i] = 1;
            }
            return;
        }
        fx[i] += fvx[i];
        fh[i] += fvy[i];
        if (fhit[i] && fvx[i] && fsp_n[i] == 1)
        {
            // acertou (ou foi defendido): continua subindo como o Shoryuken, so para de avancar (nao atravessa)
            fsp_n[i] = 2;
            fvx[i] = 0;
        }
        if (fh[i] > 0)
        {
            fvy[i] -= 22;
            if (fvy[i] > 0)
                fidx[i] = 1;
            else if (fvy[i] > -110)
                fidx[i] = 2;
            else
                fidx[i] = 3;
        }
        else
        {
            fh[i] = 0;
            fvy[i] = 0;
            fvx[i] = 0;
            if (fidx[i] < 4)
            {
                fidx[i] = 4;
                ftick[i] = 8; // recuperacao no chao
            }
            else if (ftick[i])
                ftick[i]--;
            else
            {
                fsp_lock[i] = 30;
                land_state(i, keys);
                return;
            }
        }
        check_hit(i);
        return;
    }
    if (id == ATK_TATSU)
    {
        // idx0 prepara; idx1-4 giram 3 vezes avancando; idx5 termina
        if (fidx[i] == 0)
            anim_step(i, 5, 1);
        else if (fidx[i] < 5)
        {
            // o Tatsumaki nao atravessa o oponente em pe (acertando ou defendido): para no corpo dele.
            // Medio: avanca menos (alcance menor); forte: alcance atual
            spd = 22;               // HK: alcance maximo (forte do video)
            if (!fstrong[i])
                spd = 9;        // LK: alcance menor
            nx = fx[i] + sg * spd;
            dnow = fx[i] - fx[i ^ 1];
            if (dnow < 0)
                dnow = -dnow;
            dnew = nx - fx[i ^ 1];
            if (dnew < 0)
                dnew = -dnew;
            if (fh[i ^ 1] > 0 || dnew >= 256 || dnew >= dnow)
                fx[i] = nx;
            fh[i] = 1700;   // altura do giro (video de referencia: ~26 px acima do chao)
            if (!fstrong[i])
                fh[i] = 1300; // LK: giro mais baixo
            if (ftick[i])
                ftick[i]--;
            if (!ftick[i])
            {
                ftick[i] = 3;
                fidx[i]++;
                if (fidx[i] == 5)
                {
                    fsp_n[i]++;
                    fhit[i] = 0;
                    if (fsp_n[i] < 3)
                        fidx[i] = 1; // mais uma volta
                    else
                        ftick[i] = 10; // recuperacao
                }
                else if (fidx[i] == 1)
                    fhit[i] = 0;
            }
        }
        else
        {
            fh[i] = 0;
            fsp_lock[i] = 30;
            if (ftick[i])
                ftick[i]--;
            if (!ftick[i])
                land_state(i, keys);
        }
        check_hit(i);
        return;
    }
    // golpes comuns e a bola de fogo: quadros com duracao fixa
    if (fkb[i])
    {
        fx[i] += fkb[i]; // recuo do atacante depois de acertar/ser defendido
        if (fkb[i] > 0)
            fkb[i]--;
        else
            fkb[i]++;
    }
    // golpe normal medio que acertou (ou foi defendido) pode ser cancelado em especial
    if (fhit[i] && (down & (KEY_B | KEY_Y | KEY_A | KEY_X)) &&
        (id == ATK_MP || id == ATK_MK || id == ATK_CMP || id == ATK_CMK || id == ATK_CLOSE_HP || id == ATK_CLOSE_MK))
    {
        if (try_special(i, down))
            return;
    }
    if (id == ATK_THROW)
        throw_update(i);
    dur = adur(i, id, fidx[i]);
    if (id == ATK_HADOUKEN && fidx[i] == 2 && fsp_t[i] == 0)
    {
        fsp_t[i] = 1;
        spawn_fireball(i);
    }
    if (fcounter[i] && fidx[i] >= 2 && !fhit[i])
    {
        // Contra-Golpe: acerta o oponente perto em qualquer posicao (agachado, no ar), sem depender da hitbox
        u8 d = i ^ 1;
        s16 dd = (fx[i] - fx[d]) >> 3;
        if (dd < 0)
            dd = -dd;
        if (dd <= 80 && fstate[d] != ST_KNOCKDOWN)
        {
            hit_cx = (fx[i] + fx[d]) >> 4;
            hit_cy = GROUND_Y - 60 - (fh[d] >> 6);
            apply_hit(i, d, ATK_HP, 1);
        }
    }
    check_hit(i);
    if (ftick[i])
        ftick[i]--;
    if (ftick[i])
        return;
    if (fidx[i] + 1 < fcount[i])
    {
        fidx[i]++;
        ftick[i] = adur(i, id, fidx[i]);
        if (id == ATK_CLOSE_HK && fidx[i] == 1)
            fhit[i] = 0; // o chute forte de perto tem 2 golpes (um por quadro ativo)
    }
    else
    {
        // acabou: volta ao agachado (se ainda segura baixo) ou ao parado
        land_state(i, keys);
    }
}

// no ar
void jump_update(u8 i, u16 keys, u16 down)
{
    u8 id, dur, t, k, back;
    if (fhop[i])
    {
        fx[i] += fvx[i];
        fh[i] += fvy[i];
        if (fvy[i] > 0)
            fvy[i] -= GRAV_UP;
        else
            fvy[i] -= GRAV_DN;
        fjump_t[i]++;
        fidx[i] = 1;
        if (fh[i] <= 0 && fvy[i] < 0)
        {
            fh[i] = 0;
            fvx[i] = 0;
            fvy[i] = 0;
            fhop[i] = 0;
            land_state(i, keys);
        }
        return;
    }
    fx[i] += fvx[i];
    fh[i] += fvy[i];
    if (fvy[i] > 0)
        fvy[i] -= GRAV_UP;
    else
        fvy[i] -= GRAV_DN;
    fjump_t[i]++;
    id = fatk[i];
    if (fjump_t[i] < 11 && fvx[i] == 0 && id == NOATK)
    {
        // quem aperta a direcao um pouco depois de cima ainda faz o pulo diagonal
        if (keys & KEY_LEFT)
        {
            fvx[i] = -JUMP_VX;
            play_anim(i, A_FJUMP, A_FJUMP_N, 255);
        }
        else if (keys & KEY_RIGHT)
        {
            fvx[i] = JUMP_VX;
            play_anim(i, A_FJUMP, A_FJUMP_N, 255);
        }
    }
    if (id == NOATK && !frev[i])
    {
        if (down & (KEY_B | KEY_Y))
            start_attack(i, ATK_JP);
        else if (down & (KEY_A | KEY_X))
        {
            if (fchar[i] && (down & KEY_X))
            {
                // Sagat, chute forte no ar (parado ou na diagonal): a voadora de chute diagonal para baixo (quadro 57
                // da folha, com a caixa dela). Mesmo ritmo da voadora: encolhe, chuta e volta a encolher
                start_attack(i, ATK_JDK);
                play_anim(i, A_JHK, A_JHK_N, adur(i, ATK_JDK, 0));
            }
            else if (fvx[i])
                start_attack(i, ATK_JDK);
            else
                start_attack(i, ATK_JK);
        }
        id = fatk[i];
    }
    if (id != NOATK)
    {
        // golpe no ar: estende (hitbox ativa), recolhe e fica no quadro de antes ate pousar
        k = ((id - ATK_JP) << 2) + fsp_n[i];
        dur = jseq_d[k];
        if (dur != 255)
        {
            if (ftick[i])
                ftick[i]--;
            if (!ftick[i])
            {
                fsp_n[i]++;
                k++;
                fidx[i] = jseq_f[k];
                ftick[i] = jseq_d[k];
                if (jseq_d[k] == 255)
                {
                    // fim do golpe: o pulo passa a rodar ao contrario ate o pouso
                    frev[i] = 1;
                    fatk[i] = NOATK;
                    play_anim(i, A_JUMP, A_JUMP_N, 255); // sempre o pulo vertical parado, ao contrario
                    id = NOATK;
                }
            }
        }
        if (id != NOATK)
            check_hit(i);
    }
    if (id != NOATK)
        ;
    else if (fvx[i] && !frev[i])
    {
        // pulo com giro: decolagem, 4 quadros de giro (uma volta completa entre a subida e a queda) e pouso.
        // Para tras o giro e no sentido contrario: os 4 quadros do meio passam na ordem inversa
        back = 0;
        if (fvx[i] > 0 && fdir[i])
            back = 1;
        if (fvx[i] < 0 && !fdir[i])
            back = 1;
        t = fjump_t[i];
        if (t < 7)
            k = 0;
        else if (t < 18)
            k = 1;
        else if (t < 29)
            k = 2;
        else if (t < 40)
            k = 3;
        else if (t < 51)
            k = 4;
        else
            k = 5;
        if (back && k > 0 && k < 5)
            k = 5 - k;
        if (frev[i])
            k = 5 - k;
        fidx[i] = k;
    }
    else
    {
        if (fvy[i] > 100 || fvy[i] < -100)
            fidx[i] = 0;
        else
            fidx[i] = 1;
        if (frev[i])
        {
            fidx[i] = 1;            // invertido: pernas recolhidas e so estica perto do chao
            if (fh[i] < 1536)
                fidx[i] = 0;
        }
    }
    if (fh[i] <= 0 && fvy[i] < 0)
    {
        fh[i] = 0;
        fvx[i] = 0;
        fvy[i] = 0;
        play_sfx(SFX_LANDING);
        land_state(i, keys);
    }
}

// dor: fica sem controle e e empurrado
void hitstun_update(u8 i, u16 keys)
{
    fx[i] += fkb[i];
    if (fkb[i] > 0)
        fkb[i]--;
    else if (fkb[i] < 0)
        fkb[i]++;
    if (ftick[i])
        ftick[i]--;
    if (!ftick[i])
    {
        ftick[i] = fsp_t[i];
        if (fidx[i] + 1 < fcount[i])
            fidx[i]++;
    }
    if (fstun[i])
        fstun[i]--;
    if (!fstun[i])
    {
        if (fcr[i])
            keys |= KEY_DOWN; // dor agachado: continua agachado
        land_state(i, keys);
        if (fcpu[i])
        {
            // saiu da dor: a CPU entra em guarda (so da para encadear dentro da dor). Saiu de uma defesa: o golpe que
            // quebrou o combo ja foi bloqueado, a guarda e zerada e ela volta a ficar vulneravel
            fguard[i] = GUARD_T;
            if (fblk[i])
                fguard[i] = 0;
        }
        fblk[i] = 0;
    }
}

// queda: arco no ar, deitado, levantando
void knockdown_update(u8 i)
{
    if (fkd_ph[i] == KD_AIR)
    {
        fx[i] += fvx[i];
        fh[i] += fvy[i];
        fvy[i] -= GRAV;
        fkd_t[i]++;
        // 3 quadros de queda ao longo do arco
        if (fvy[i] > 100)
            fidx[i] = 0;
        else if (fvy[i] > -100)
            fidx[i] = 1;
        else
            fidx[i] = 2;
        if (fh[i] <= 0 && fvy[i] < 0 && fthrown[i] == 1)
        {
            // agarrao: bate no chao e quica uma vez
            fthrown[i] = 2;
            hitstop = 6;
            hit_cx = fx[i] >> 3;
            hit_cy = GROUND_Y - 8;
            hit_fx(SFX_FORWARD);
            damage(i, mv_dmg[mvb[i] + ATK_THROW]); // agarrao: o dano entra quando bate no chao
            fh[i] = 64;
            fvy[i] = 150;
            fvx[i] >>= 2;
            play_sfx(SFX_GROUND);
        }
        else if (fh[i] <= 0 && fvy[i] < 0)
        {
            fh[i] = 0;
            fvx[i] = 0;
            fvy[i] = 0;
            fkd_ph[i] = KD_LIE;
            fkd_t[i] = 0;
            play_anim(i, A_KO, A_KO_N, 4);
            play_sfx(SFX_GROUND);
        }
    }
    else if (fkd_ph[i] == KD_LIE)
    {
        fkd_t[i]++;
        if (fko[i])
            fkd_t[i] = 0; // K.O.: fica deitado
        else if (fkd_t[i] > (fthrown[i] ? 50 : 40)) // agarrao: fica 25% mais tempo deitado
        {
            fkd_ph[i] = KD_RISE;
            fkd_t[i] = 0;
            play_anim(i, A_CROUCH_IN, A_CROUCH_IN_N, 255);
            if (fthrown[i])
                play_anim(i, A_RISE, A_RISE_N, 255); // levanta de ponta-cabeca (referencia do agarrao)
            finv[i] = 20;
        }
    }
    else
    {
        fkd_t[i]++;
        if (fthrown[i] && fkd_t[i] == 8)
            fidx[i] = 1;
        if (fkd_t[i] > 14)
        {
            fthrown[i] = 0;
            land_state(i, 0);
        }
    }
}

// "teclas" da CPU (P2): sem controle, so a guarda: agacha quando o oponente ataca por baixo
u16 cpu_keys(u8 i)
{
    u8 o = i ^ 1;
    u16 k = 0;
    fback[i] = 0;
    if (!fguard[i])
        return 0;
    fback[i] = 1;
    if (fatk[o] != NOATK)
    {
        if (fguard[i] < 12)
            fguard[i] = 12; // enquanto o oponente ataca, continua em guarda
        if (mv_hgt[mvb[o] + fatk[o]] == HGT_LOW)
            k = KEY_DOWN;  // golpe baixo: defesa agachada; os outros: em pe
    }
    if (fstate[i] == ST_IDLE || fstate[i] == ST_CROUCH || fstate[i] == ST_WALK)
        fguard[i]--;
    return k;
}

// um quadro de logica do lutador i controlado por 'keys' (down = apertos novos)
void fighter_update(u8 i, u16 keys, u16 down)
{
    s8 dx = 0;
    s16 spd;
    u8 fwd, c, t, st = fstate[i];
    hist_head = hist_hd[i]; // historico de comandos deste jogador (motion_id)
    hist_off = i << 5;
    cur_keys = keys;
    if (fwin[i])
    {
        anim_step(i, 8, 1); // pose de vitoria (anima uma vez e fica no ultimo quadro)
        return;
    }
    if (st != ST_JUMP)
        fhop[i] = 0;
    if (fhits[i] && ++fhits_t[i] >= HITS_DECAY)
    {
        fhits[i]--;
        fhits_t[i] = 0;
    }
    if (st == ST_IDLE && !finv[i] && fanim[i] == A_IDLE &&
        !((keys | down) & (KEY_LEFT | KEY_RIGHT | KEY_UP | KEY_DOWN | KEY_B | KEY_Y | KEY_A | KEY_X)))
    {
        // parado sem apertar nada (o caso comum): so vira para o oponente e passa o quadro do idle
        if (!fcpu[i])
            fback[i] = 0; // (a CPU decide a guarda em cpu_keys: nao pode zerar aqui)
        fcr[i] = 0;
        face_opponent(i);
        anim_step(i, 7, 0);
        return;
    }
    if (fsp_lock[i])
        fsp_lock[i]--;
    if (finv[i] && st != ST_ATTACK)
        finv[i]--;
    if (!fcpu[i])
    {
        // segurar 'para tras' (o lado oposto ao que olha) = guarda
        if (fdir[i])
            fback[i] = (keys & KEY_RIGHT) != 0;
        else
            fback[i] = (keys & KEY_LEFT) != 0;
    }
    if (st == ST_HITSTUN)
    {
        if (fsp_t[i] == 255 && !fcpu[i] && fatk[i ^ 1] == ATK_THROW && fstate[i ^ 1] == ST_ATTACK && fidx[i ^ 1] < 3 &&
            (down & (KEY_B | KEY_Y | KEY_A | KEY_X)))
        {
            throw_break(i ^ 1, i);
            return;
        }
        if (fblk[i] && fstock[i] &&
            (fcpu[i] || (((keys | down) & KEY_Y) && ((keys | down) & KEY_X))))
        {
            do_counter(i);
            return;
        }
        hitstun_update(i, keys);
        return;
    }
    if (st == ST_KNOCKDOWN)
    {
        knockdown_update(i);
        return;
    }
    if (st == ST_JUMP)
    {
        jump_update(i, keys, down);
        return;
    }
    if (st == ST_ATTACK)
    {
        attack_update(i, keys, down);
        return;
    }
    face_opponent(i);
    if (keys & KEY_LEFT)
        dx = -1;
    else if (keys & KEY_RIGHT)
        dx = 1;
    if ((down & KEY_L) && throw_ok(i, keys))
    {
        start_throw(i);
        return;
    }
    if (!fcpu[i] && (down & (KEY_LEFT | KEY_RIGHT)))
    {
        // dois toques para TRAS (em ate DASH_WIN quadros): backdash. (condicoes separadas: o tcc-816 erra condicoes longas e '? :')
        t = 1;
        if (down & KEY_RIGHT)
            t = 2;
        c = 0;
        if (tap_d[i] == t)
            c = 1;
        if ((u16)(gclk - tap_at[i]) > DASH_WIN)
            c = 0;
        if ((u16)(gclk - hop_at[i]) < HOP_WAIT)
            c = 0;
        if (keys & (KEY_DOWN | KEY_UP))
            c = 0;
        fwd = 0;                     // 1 = o toque e para tras (nao mexer em 'dx': e a direcao do andar deste quadro)
        if (fdir[i] == 0 && t == 1)
            fwd = 1;
        if (fdir[i] && t == 2)
            fwd = 1;
        if (c && fwd)
        {
            dx = -1;
            if (t == 2)
                dx = 1;
            start_hop(i, dx);
            return;
        }
#if HOP_FORWARD
        if (c && !fwd && !(keys & (KEY_DOWN | KEY_UP)) && (u16)(gclk - hop_at[i]) >= HOP_WAIT)
        {
            dx = -1;
            if (t == 2)
                dx = 1;
            start_hop(i, dx);
            return;
        }
#endif
        tap_d[i] = t;
        tap_at[i] = gclk;
    }
    // golpes especiais e normais (no chao)
    if (down & (KEY_B | KEY_Y | KEY_A | KEY_X))
    {
        if (try_special(i, down))
            return;
        if (try_normal(i, down, (keys & KEY_DOWN) != 0))
            return;
    }
    if (keys & KEY_UP)
    {
        start_jump(i, dx);
        return;
    }
    if (keys & KEY_DOWN)
    {
        fcr[i] = 1;
        if (fstate[i] != ST_CROUCH)
        {
            // abaixando: 3 quadros de transicao antes do agachado
            fstate[i] = ST_CROUCH;
            fcrt[i] = 3;
            play_anim(i, A_CROUCH_IN, A_CROUCH_IN_N, 255);
        }
        else if (fcrt[i])
        {
            fcrt[i]--;
            if (!fcrt[i])
                set_anim(i, A_CROUCH, A_CROUCH_N, 255);
        }
        else
            set_anim(i, A_CROUCH, A_CROUCH_N, 255);
        return;
    }
    fcr[i] = 0;
    if (dx)
    {
        fwd = 0;
        if (dx == 1 && fdir[i] == 0)
            fwd = 1;
        if (dx == -1 && fdir[i] == 1)
            fwd = 1;
        spd = WALK_BACK;
        if (fwd)
            spd = WALK_FWD;
        c = TR(i, TRK_WALK_TICKS);          // duracao de cada quadro do andar
        spd += (s16)TR(i, TRK_WALK_ADJ);    // Sagat: passos pesados (mais devagar)
        fx[i] += dx * spd;
        fstate[i] = ST_WALK;
        if (fwd)
            set_anim(i, A_WALK, A_WALK_N, c);
        else
            set_anim(i, A_WALKB, A_WALKB_N, c);
        if (TR(i, TRK_PINGPONG))
        {
            // DonLee: andar mais devagar e em vai-e-volta (ping-pong): quadros 0 1 2 3 4 3 2 1
            if (ftick[i])
                ftick[i]--;
            if (!ftick[i])
            {
                ftick[i] = 7;
                fpp[i]++;
                if (fpp[i] >= 8)
                    fpp[i] = 0;
                fidx[i] = pp_seq[fpp[i]];
            }
            return;
        }
        anim_step(i, c, 0);
        return;
    }
    fpp[i] = 0;
    fstate[i] = ST_IDLE;
    set_anim(i, A_IDLE, A_IDLE_N, 7);
    anim_step(i, 7, 0);
}

// os corpos nao se atravessam no chao e ninguem sai da tela

// a camera segue o meio dos dois lutadores; ninguem sai da tela
void cam_update(void)
{
    s16 t = ((fx[0] + fx[1]) >> 4) - 128, lo, hi;
    if (thr_hold && (fatk[0] == ATK_THROW || fatk[1] == ATK_THROW))
        return; // agarrao: a vitima passa por tras do Ryu; a camera nao acompanha esse vai e vem
    if (fx[0] < fx[1])
    {
        lo = (fx[1] >> 3) - 240;
        hi = (fx[0] >> 3) - 16;
    }
    else
    {
        lo = (fx[0] >> 3) - 240;
        hi = (fx[1] >> 3) - 16;
    }
    if (t < 0)
        t = 0;
    if (t > CAM_MAX)
        t = CAM_MAX;
    if (cam < t)
    {
        cam += 3;
        if (cam > t)
            cam = t;
    }
    else if (cam > t)
    {
        cam -= 3;
        if (cam < t)
            cam = t;
    }
    // a camera so anda enquanto os dois cabem na tela: quem esta no canto nao e arrastado nem arrasta o outro
    if (cam < lo)
        cam = lo;
    if (cam > hi)
        cam = hi;
    if (cam < 0)
        cam = 0;
    if (cam > CAM_MAX)
        cam = CAM_MAX;
    xlo = (cam + 16) << 3;
    xhi = (cam + 240) << 3;
    cam_done = (cam == t);
}

// os corpos nao se atravessam no chao e ninguem sai da tela
void resolve_inner(void)
{
    s16 d, over;
    if (fx[0] < xlo)
        fx[0] = xlo;
    if (fx[0] > xhi)
        fx[0] = xhi;
    if (fx[1] < xlo)
        fx[1] = xlo;
    if (fx[1] > xhi)
        fx[1] = xhi;
    if (fh[0] > 0 || fh[1] > 0)
        return; // quem esta no ar nao empurra nem e empurrado (senao o pulo para frente, de perto, nao sai do lugar)
    d = fx[1] - fx[0];
    if (d < 0)
        d = -d;
    if (d < 32 * 8)
    {
        over = (32 * 8 - d) >> 1;
        if (fx[0] <= fx[1])
        {
            fx[0] -= over;
            fx[1] += over;
        }
        else
        {
            fx[0] += over;
            fx[1] -= over;
        }
        if (fx[0] < xlo)
        {
            fx[1] += xlo - fx[0];
            fx[0] = xlo;
        }
        if (fx[1] < xlo)
        {
            fx[0] += xlo - fx[1];
            fx[1] = xlo;
        }
        if (fx[0] > xhi)
        {
            fx[1] -= fx[0] - xhi;
            fx[0] = xhi;
        }
        if (fx[1] > xhi)
        {
            fx[0] -= fx[1] - xhi;
            fx[1] = xhi;
        }
    }
}

// primeiro prende os lutadores na tela atual; so depois a camera anda (quem esta no canto nao puxa a camera)
void resolve_bodies(void)
{
    if (thr_hold && (fatk[0] == ATK_THROW || fatk[1] == ATK_THROW))
        return; // agarrao: a vitima e posicionada quadro a quadro, sem empurrao entre os corpos
    if (fx[0] == rb_x0 && fx[1] == rb_x1 && cam == rb_c && cam_done && !fh[0] && !fh[1])
        return;
    resolve_inner();
    cam_update();
    rb_x0 = fx[0];
    rb_x1 = fx[1];
    rb_c = cam;
}

//---------------------------------------------------------------------------------
// desenho: decide o que vai para a VRAM neste quadro (limite de pedacos por vblank) e monta a OAM
// ordem dos envios: bolas, sombras e faisca primeiro (pequenos, cabem no comeco do vblank), lutadores depois
const u8 up_order[7] = {2, 3, 4, 5, 6, 0, 1};


// fila de envios para a VRAM: montada fora do vblank (o C e lento) e so executada no vblank

// plan_frames: em assembly (src/drawobj.asm): escolhe o que vai para a VRAM no proximo vblank (fila up_*)
void plan_frames(void);
u16 pl_budget, pl_i, pl_f, pl_rf, pl_cnt, pl_c, pl_ch, pl_tmp, pl_char0, pl_sz, pl_src, pl_bank, pl_dst; // do plan_frames

// do_uploads: em assembly (src/drawobj.asm): a fila de envios para a VRAM, por DMA, no vblank
void do_uploads(void);

// desenha o objeto o (pes em x px; alt = altura dos pes em px) virado para a esquerda se flip
// A OAM e persistente: cada objeto tem uma faixa fixa de sprites (multiplo de 4, para ter os proprios bytes da
// tabela alta) e so e redesenhado quando muda de posicao/quadro/lado. Parado, o desenho custa quase nada.
//          faisca  P1  P2  bola1 bola2 sombra1 sombra2   (indice do objeto o: 0 P1, 1 P2, 2-3 bolas, 4-5 sombras, 6 faisca)
u8 oam_base[7];             // faixa de cada objeto na OAM (o lutador da faixa 4 fica na frente: quem ataca)
u8 front;                   // lutador desenhado na frente
const u8 oam_cap[7] = {24, 24, 4, 4, 4, 4, 4}; // (24 = o maximo de pedacos de um quadro; com 20 o DonLee invadia a faixa do outro lutador)
u8 oam_n[7];                // sprites usados por objeto
s16 oc_x[7], oc_y[7];       // ultimo desenho: posicao ...
u8 oc_f[7], oc_k[7];        // ... quadro e (buffer + lado + paleta)

void hide_obj(u8 o)
{
    u8 n = oam_n[o], k = oam_base[o];
    oc_f[o] = 255;
    if (!n)
        return;
    while (n--)
    {
        oamMemory[(k << 2) + 1] = 240;
        k++;
    }
    oam_n[o] = 0;
}

// draw_obj: em assembly (src/drawobj.asm)
void draw_obj(u8 o, s16 sx, s16 alt, u8 flip, u8 pal);
u16 do_o, do_sx, do_alt, do_flip, do_pal, do_f, do_rf, do_kk, do_tmp, do_tmp2, do_base; // variaveis do draw_obj

//---------------------------------------------------------------------------------
// DEBUG (botao L): hurtboxes (verde) e hitboxes (vermelho) dos dois lutadores, com precisao de pixel.
// Contornos montados no BG3 (por cima de tudo) com tiles prontos (res/dbg.bin: linhas e cantos de cada pixel
// da celula, uma serie verde e uma vermelha). Quando duas linhas caem na mesma celula, o tile e a soma (OR) dos dois.
// As linhas 0-3 de tiles ficam para a barra de energia.
#define DBG_HF 0      // linha inteira r
#define DBG_VF 8      // coluna inteira c
#define DBG_TL 16     // cantos: + r * 8 + c
#define DBG_TR 80
#define DBG_BL 144
#define DBG_BR 208
#define DBG_TLT 272   // ponta esquerda de uma divisoria (linha + coluna inteira)
#define DBG_TRT 336
#define DBG_RED 400   // a serie vermelha comeca aqui
#define DBG_COMP (DBG_TILE0 + DBG_STATIC) // tiles somados (RAM) ficam depois dos prontos
u8 dbg_comp_n;
u8 dbg_r0, dbg_r1;       // linhas de tiles que o debug usou neste quadro (menor e maior)
u8 dbg_pr0, dbg_pr1;     // ... e no quadro anterior (precisam ser limpas)
u8 dbg_up0, dbg_up1;     // linhas a mandar para a VRAM neste vblank
u8 dbg_up_comp, dbg_force, dbg_cool;
u16 dbg_last_sig;
u16 acc_down;               // botoes novos do 1o vblank do quadro (o quadro dura 2 vblanks)
u8 dbg_comp[64 * 16];    // tiles somados
u16 dbg_col;             // desvio da serie de cor (0 verde, DBG_RED vermelho)
#define DBG_FLAGS (PRIO | (1 << 10)) // prioridade alta, paleta 1 do BG3

// celula k ja tem outra linha: o tile vira a soma (OR) dos dois desenhos
void dbg_merge(u16 k, u16 id)
{
    u16 cur = map3[k] & 0x3FF, *a, *b, *d;
    u8 i;
    if (cur == id)
        return;
    if (cur < DBG_COMP)
    {
        if (dbg_comp_n >= 60)
            return;
        d = (u16 *)&dbg_comp[dbg_comp_n << 4];
        a = (u16 *)(&dbg_bin + ((cur - DBG_TILE0) << 4));
        for (i = 0; i < 8; i++)
            d[i] = a[i];
        cur = DBG_COMP + dbg_comp_n;
        dbg_comp_n++;
        map3[k] = cur | DBG_FLAGS;
    }
    d = (u16 *)&dbg_comp[(cur - DBG_COMP) << 4];
    b = (u16 *)(&dbg_bin + ((id - DBG_TILE0) << 4));
    for (i = 0; i < 8; i++)
        d[i] |= b[i];
}

#define DBG_SET(k, id)            \
    if (map3[k] == 0)             \
        map3[k] = (id) | DBG_FLAGS; \
    else                          \
        dbg_merge(k, id)

// retangulo vazado: y0 = topo, y1 = base, x0/x1 em px de tela (precisa ter pelo menos 8 px de lado)
void dbg_rect(s16 x0, s16 y0, s16 x1, s16 y1)
{
    x0 -= cam;
    x1 -= cam;
    u8 cx0, cx1, cy0, cy1, c, r;
    u16 k, ktop, kbot, cb, id, idt;
    u8 ax, bx, r0, r1;
    if (x0 < 0)
        x0 = 0;
    if (x1 > 255)
        x1 = 255;
    if (y0 < 32)
        y0 = 32;
    if (y1 > 223)
        y1 = 223;
    if (x1 - x0 < 8 || y1 - y0 < 8)
        return;
    cx0 = x0 >> 3;
    cx1 = x1 >> 3;
    cy0 = y0 >> 3;
    cy1 = y1 >> 3;
    ax = x0 & 7;
    bx = x1 & 7;
    r0 = y0 & 7;
    r1 = y1 & 7;
    if (cy0 < dbg_r0)
        dbg_r0 = cy0;
    if (cy1 > dbg_r1)
        dbg_r1 = cy1;
    cb = DBG_TILE0 + dbg_col;
    ktop = cy0;
    ktop <<= 5;
    kbot = cy1;
    kbot <<= 5;
    k = ktop + cx0;
    id = cb + DBG_TL + (r0 << 3) + ax;
    DBG_SET(k, id);
    k = ktop + cx1;
    id = cb + DBG_TR + (r0 << 3) + bx;
    DBG_SET(k, id);
    k = kbot + cx0;
    id = cb + DBG_BL + (r1 << 3) + ax;
    DBG_SET(k, id);
    k = kbot + cx1;
    id = cb + DBG_BR + (r1 << 3) + bx;
    DBG_SET(k, id);
    id = cb + DBG_HF + r0;
    idt = cb + DBG_HF + r1;
    for (c = cx0 + 1; c < cx1; c++)
    {
        k = ktop + c;
        DBG_SET(k, id);
        k = kbot + c;
        DBG_SET(k, idt);
    }
    id = cb + DBG_VF + ax;
    idt = cb + DBG_VF + bx;
    k = ktop + cx0;
    kbot = ktop + cx1;
    for (r = cy0 + 1; r < cy1; r++)
    {
        k += 32;
        kbot += 32;
        DBG_SET(k, id);
        DBG_SET(kbot, idt);
    }
}

// linha horizontal divisoria entre x0 e x1 (as pontas encostam nas laterais do retangulo)
void dbg_hdiv(s16 x0, s16 x1, s16 y)
{
    x0 -= cam;
    x1 -= cam;
    u8 cx0, cx1, cy, c, r;
    u16 k, kr, cb, id;
    if (y < 32 || y > 223 || x1 - x0 < 8)
        return;
    cx0 = x0 >> 3;
    cx1 = x1 >> 3;
    cy = y >> 3;
    r = y & 7;
    cb = DBG_TILE0 + dbg_col;
    kr = cy;
    kr <<= 5;
    k = kr + cx0;
    id = cb + DBG_TLT + (r << 3) + (x0 & 7);
    DBG_SET(k, id);
    k = kr + cx1;
    id = cb + DBG_TRT + (r << 3) + (x1 & 7);
    DBG_SET(k, id);
    id = cb + DBG_HF + r;
    for (c = cx0 + 1; c < cx1; c++)
    {
        k = kr + c;
        DBG_SET(k, id);
    }
}

// monta os retangulos do quadro: o mesmo calculo que a logica usa (hurt_x/hurt_y, atk_* e a bola de fogo)
void dbg_build(void)
{
    u8 d;
    s16 x0, x1, y0, y1, ytop, ydiv1, ydiv2;
    for (d = 0; d < 2; d++)
    {
        // hurtboxes (so aparecem quando o lutador pode ser acertado)
        if (fstate[d] != ST_KNOCKDOWN && !finv[d])
        {
            dbg_col = 0;
            hurt_x(d, &x0, &x1);
            // corpo = um retangulo (cabeca ate pes) com duas divisorias: cabeca / tronco / pernas
            hurt_y(d, 0, &y0, &y1);
            ytop = GROUND_Y - y1;
            ydiv1 = GROUND_Y - y0;
            hurt_y(d, 1, &y0, &y1);
            ydiv2 = GROUND_Y - y0;
            hurt_y(d, 2, &y0, &y1);
            dbg_rect(x0, ytop, x1, GROUND_Y - y0);
            dbg_hdiv(x0, x1, ydiv1);
            dbg_hdiv(x0, x1, ydiv2);
        }
        dbg_col = DBG_RED;
        // hitbox do golpe, nos quadros ativos (a mesma que a logica usa)
        if (get_hitbox(d, &x0, &x1, &y0, &y1, 0))
            dbg_rect(x0, GROUND_Y - y1, x1, GROUND_Y - y0);
        if (get_hitbox(d, &x0, &x1, &y0, &y1, 1))
            dbg_rect(x0, GROUND_Y - y1, x1, GROUND_Y - y0);
        if (pj_on[d] == 1)
        {
            if (pj_dir[d] < 0)
            {
                x0 = pj_x[d] - pf_hbx1[A_FIREBALL + choff[d]];
                x1 = pj_x[d] - pf_hbx0[A_FIREBALL + choff[d]];
            }
            else
            {
                x0 = pj_x[d] + pf_hbx0[A_FIREBALL + choff[d]];
                x1 = pj_x[d] + pf_hbx1[A_FIREBALL + choff[d]];
            }
            dbg_rect(x0, GROUND_Y - (pj_alt[d] + pf_hby1[A_FIREBALL + choff[d]]), x1, GROUND_Y - (pj_alt[d] + pf_hby0[A_FIREBALL + choff[d]]));
        }
    }
}

// assinatura do que o debug desenha: so remonta quando algo mudou (parado = custo zero)
u16 dbg_sig(void)
{
    u16 v;
    v = fx[0] + (fx[1] << 1) + (fh[0] << 2) + (fh[1] << 3) + (cam << 5);
    v += (fstate[0] << 4) + (fstate[1] << 6) + (fcr[0] << 8) + (fcr[1] << 9);
    v += (fatk[0] << 10) + (fatk[1] << 11);
    if (fatk[0] != NOATK)
        v += fidx[0] << 12; // o quadro da animacao so importa durante o golpe (hitbox)
    if (fatk[1] != NOATK)
        v += fidx[1] << 13;
    if (pj_on[0] != 1 && pj_on[1] != 1)
        v += 0;
    v += (fdir[0] << 14) + (finv[0] != 0) + ((finv[1] != 0) << 15);
    if (pj_on[0] == 1)
        v += pj_x[0] + 777;
    if (pj_on[1] == 1)
        v += (pj_x[1] << 1) + 1555;
    return v;
}

// no quadro: limpa as linhas usadas no quadro anterior e monta o novo (so quando o debug esta ligado ou
// acabou de desligar)
void dbg_frame(void)
{
    if (dbg_pr0 != 255)
    {
        memset(&map3[dbg_pr0 << 5], 0, (dbg_pr1 - dbg_pr0 + 1) << 6);
        if (dbg_pr0 <= HUD_WIN)
        {
            bar_hp_old[0] = bar_hp_old[1] = 0;
            draw_bar(0, fhp[0]);
            draw_bar(1, fhp[1]);
            if (game_mode != MODE_PRACTICE)
                draw_wins();
        }
        if (dbg_pr1 >= HUD_SP)
        {
            super_full(0);
            super_full(1);
        }
    }
    dbg_r0 = 255;
    dbg_r1 = 0;
    dbg_comp_n = 0;
    if (dbg_on)
        dbg_build();
    // as linhas de tiles a mandar: as do quadro anterior (limpar) e as novas
    dbg_up0 = dbg_r0;
    dbg_up1 = dbg_r1;
    if (dbg_pr0 != 255)
    {
        if (dbg_pr0 < dbg_up0)
            dbg_up0 = dbg_pr0;
        if (dbg_pr1 > dbg_up1)
            dbg_up1 = dbg_pr1;
    }
    dbg_pr0 = dbg_r0;
    dbg_pr1 = dbg_r1;
    dbg_up_comp = 1;
}

// no vblank: tiles somados e as linhas do mapa que mudaram (um bloco so, do menor ao maior)
void dbg_upload(void)
{
    u16 sz;
    if (dbg_comp_n && dbg_up_comp)
        dmaCopyVram(dbg_comp, VRAM_BG3_GFX + (DBG_COMP << 3), dbg_comp_n << 4);
    dbg_up_comp = 0;
    if (dbg_up0 != 255)
    {
        sz = dbg_up1 - dbg_up0 + 1;
        sz <<= 6;
        dmaCopyVram((u8 *)&map3[dbg_up0 << 5], VRAM_BG3_MAP + (dbg_up0 << 5), sz);
        dbg_up0 = 255;
    }
}

u16 oam_last;

// altura da base do desenho da bola: a bola inteira fica na altura das maos; os efeitos de dissipacao (menores) ficam
// centralizados nela
s16 fb_alt(u8 i)
{
    if (pj_on[i] == 2 && fwant[2 + i] != 255)
        return pj_alt[i] + ((28 - pf_h[fwant[2 + i] + choff[i]]) >> 1);
    return pj_alt[i];
}

s16 dc_fx[2], dc_fh[2], dc_cam[2];       // ultimo desenho dos lutadores (para pular o que nao mudou)
u8 dc_f[2], dc_dir[2], dc_sb[2], dc_sf[2], dc_sw[2];

// super: 2o andar da magia (o mesmo quadro na VRAM, SUPER_DY px acima), nos sprites 68-71 (P1) e 72-75 (P2)
u8 sc_on[2];

void super_hide(u8 i)
{
    u8 k, b = 68 + (i << 2);
    if (!sc_on[i])
        return;
    sc_on[i] = 0;
    for (k = 0; k < 4; k++)
        oamMemory[((b + k) << 2) + 1] = 240;
}

void super_copy(u8 i, u8 pal)
{
    u8 k, b = 68 + (i << 2);
    u16 rf;
    if (fshown[2 + i] == 255)
        return;
    rf = fshown[2 + i] + obj_off[2 + i];
    for (k = 0; k < 4; k++)
        oamMemory[((b + k) << 2) + 1] = 240;
    oamMemory[512 + (b >> 2)] = 0;
    ms_n = pf_count[rf];
    if (ms_n > 4)
        ms_n = 4;
    ms_first = pf_first[rf];
    ms_tile = slot_char[2 + i];
    ms_y = GROUND_Y - (fb_alt(i) + SUPER_DY) - pf_h[rf];
    ms_attr = 0x20 | (pal << 1);
    ms_flip = 0;
    ms_x = pj_x[i] - cam - 64;
    if (pj_dir[i] < 0)
    {
        ms_flip = 1;
        ms_x = pj_x[i] - cam + 48;
        ms_attr |= 0x40;
    }
    ms_sprite = b;
    draw_pieces();
    sc_on[i] = 1;
}

void fight_draw(void)
{
    u8 i, c, f = front;
    // quem ataca fica na frente de quem apanha (a OAM desenha os sprites de numero menor por cima)
    if (fatk[0] != NOATK && fatk[1] == NOATK)
        f = 0;
    else if (fatk[1] != NOATK && fatk[0] == NOATK)
        f = 1;
    else if (fstate[0] == ST_HITSTUN || fstate[0] == ST_KNOCKDOWN)
        f = 1;
    else if (fstate[1] == ST_HITSTUN || fstate[1] == ST_KNOCKDOWN)
        f = 0;
    if (f != front)
    {
        hide_obj(0);
        hide_obj(1);
        front = f;
        oam_base[f] = 4;
        oam_base[f ^ 1] = 28;
        dc_f[0] = dc_f[1] = 254; // redesenha os dois
    }
    for (i = 0; i < 2; i++)
    {
        // sombra: grande no chao, pequena quando o lutador esta a mais de 20 px de altura
        if (fh[i] > 1280)
            fwant[4 + i] = A_SHADOW + 1;
        else
            fwant[4 + i] = A_SHADOW;
    }
    // faisca de defesa: 0-2 pequena, 3-6 grande, 7-9 apagando
    fwant[6] = 255;
    if (spark_t)
    {
        if (spark_t < 3)
            fwant[6] = A_SPARK;
        else if (spark_t < 7)
            fwant[6] = A_SPARK + 1;
        else
            fwant[6] = A_SPARK + 2;
    }
    PROF(pq0);
    plan_frames();
    PROF(pq1);
    if (spark_t)
        draw_obj(6, spark_x, GROUND_Y - spark_y - 8, 0, 3 + spark_hit); // centro da faisca no ponto de contato
    else
        hide_obj(6);
    for (i = 0; i < 2; i++)
    {
        // nada mudou desde o ultimo desenho deste lutador (e da sombra dele): nao precisa nem chamar
        if (fx[i] == dc_fx[i] && fh[i] == dc_fh[i] && fshown[i] == dc_f[i] && fdir[i] == dc_dir[i] && cam == dc_cam[i] &&
            sbuf[i] == dc_sb[i] && fshown[4 + i] == dc_sf[i] && fwant[4 + i] == dc_sw[i])
            continue;
        dc_fx[i] = fx[i];
        dc_fh[i] = fh[i];
        dc_f[i] = fshown[i];
        dc_dir[i] = fdir[i];
        dc_cam[i] = cam;
        dc_sb[i] = sbuf[i];
        dc_sf[i] = fshown[4 + i];
        dc_sw[i] = fwant[4 + i];
        draw_obj(i, fx[i] >> 3, fh[i] >> 6, fdir[i], i);
        draw_obj(4 + i, fx[i] >> 3, -4, 0, 3); // sombra: sempre no chao
    }
    PROF(pq2);
    for (i = 0; i < 2; i++)
    {
        if (pj_on[i])
        {
            c = TR(i, TRK_FB_PAL);
            if (pj_super[i] || pj_ex[i])
                c = 6 + i;
            draw_obj(2 + i, pj_x[i], fb_alt(i), pj_dir[i] < 0, c);
            if (pj_super[i])
                super_copy(i, c);
            else
                super_hide(i);
        }
        else
        {
            hide_obj(2 + i);
            super_hide(i);
        }
    }
    PROF(pq3);
}

// um passo de logica do jogo (o jogo roda a 30 quadros na tela: 2 passos por quadro; dn = botoes novos)
// rola o cenario escrevendo direto nos registradores, so dentro do vblank (escrever fora dele ou pelo NMI no meio
// da conta de 16 bits rasgava/piscava o cenario)
void set_cam_scroll(void)
{
    REG_BG1HOFS = cam & 255;
    REG_BG1HOFS = (cam >> 8) & 255;
    REG_BG1VOFS = SCENE_DY; // (so o byte baixo: SCENE_DY < 256)
    REG_BG1VOFS = 0;
}

// ---------------------------------------------------------------- CPU basica do P2 (SELECT liga/desliga)
u8 ai_t;                  // quadros ate a proxima decisao
u16 ai_k;                 // teclas seguradas pela CPU
u16 ai_d;                 // botoes "apertados agora" (1 quadro)
u8 ai_air;                // ja bateu neste pulo
u16 ai_seed;

u8 ai_rnd(void)
{
    ai_seed ^= ai_seed << 7;
    ai_seed ^= ai_seed >> 9;
    ai_seed ^= ai_seed << 8;
    return ai_seed & 255;
}

u16 ai_button(void)
{
    u8 r = ai_rnd() & 3;
    if (r == 0)
        return KEY_B;
    if (r == 1)
        return KEY_Y;
    if (r == 2)
        return KEY_A;
    return KEY_X;
}

// decide o que a CPU faz (distancia, o que o jogador esta fazendo e um pouco de sorte)
void ai_think(void)
{
    s16 d = (fx[1] - fx[0]) >> 3;
    u16 toward = KEY_LEFT;     // P1 a esquerda do P2
    u8 r;
    if (d < 0)
    {
        d = -d;
        toward = KEY_RIGHT;
    }
    ai_d = 0;
    if (fstate[1] == ST_JUMP)
    {
        ai_k = 0; // o pulo ja comecou: solta o 'cima' (senao pularia de novo ao pousar)
        // no ar: um golpe quando chega perto
        if (!ai_air && d < 70 && fatk[1] == NOATK)
        {
            ai_air = 1;
            ai_d = KEY_A;
            if (ai_rnd() & 1)
                ai_d = KEY_Y;
        }
        return;
    }
    ai_air = 0;
    if (fstate[1] != ST_IDLE && fstate[1] != ST_WALK && fstate[1] != ST_CROUCH)
        return;
    if (ai_t)
    {
        ai_t--;
        return;
    }
    r = ai_rnd();
    ai_k = 0;
    if (d > 130)
    {
        // longe: anda, solta Hadouken ou pula
        if (r < 150)
        {
            ai_k = toward;
            ai_t = 20;
        }
        else if (r < 215 && !pj_on[1])
        {
            fcr[1] = 0;
            start_attack(1, ATK_HADOUKEN);
            ai_t = 60;
        }
        else
        {
            ai_k = KEY_UP | toward;
            ai_t = 40;
        }
    }
    else if (d > 50)
    {
        // meia distancia: aproxima, bate de longe ou pula
        if (r < 110)
        {
            ai_k = toward;
            ai_t = 12;
        }
        else if (r < 170)
        {
            ai_d = ai_button();
            ai_t = 28;
        }
        else if (r < 205)
        {
            ai_k = KEY_UP | toward;
            ai_t = 30;
        }
        else if (r < 225 && !pj_on[1])
        {
            fcr[1] = 0;
            start_attack(1, ATK_HADOUKEN);
            ai_t = 60;
        }
        else
            ai_t = 10;
    }
    else
    {
        // colado: bate, bate agachado, recua ou se defende
        if (r < 120)
        {
            ai_d = ai_button();
            ai_t = 24;
        }
        else if (r < 160)
        {
            ai_k = KEY_DOWN;
            ai_d = ai_button();
            ai_t = 28;
        }
        else if (r < 195)
        {
            ai_k = toward == KEY_LEFT ? KEY_RIGHT : KEY_LEFT;   // recua
            ai_t = 14;
        }
        else if (r < 235)
        {
            fguard[1] = 20;   // se defende (cpu_keys segura o 'tras')
            ai_t = 18;
        }
        else
            ai_t = 8;
    }
}

// P2: com a CPU ligada age sozinho; desligada fica parado e so se defende (guarda). Parado e sem guarda: so troca o
// quadro do idle (o caso comum, bem mais barato)
void cpu_update(void)
{
    u16 k;
    u8 act = ai_on;
    // (condicoes separadas: o tcc-816 errava 'if (!ai_on || !ctl_on)' e a CPU agia com a IA desligada)
    if (!ctl_on)
        act = 0;
    if (!act)
    {
        if (fstate[1] == ST_IDLE && !fguard[1] && !finv[1] && fanim[1] == A_IDLE)
        {
            fback[1] = 0;
            face_opponent(1);
            anim_step(1, 7, 0);
            return;
        }
        fighter_update(1, cpu_keys(1), 0);
        return;
    }
    if (fatk[0] != NOATK && !fguard[1] && fstate[1] != ST_ATTACK && fstate[1] != ST_JUMP && ((fx[1] - fx[0]) >> 3) < 60 &&
        ((fx[0] - fx[1]) >> 3) < 60 && (ai_rnd() & 15) == 0)
        fguard[1] = 14; // o jogador ataca de perto: de vez em quando a CPU se defende
    ai_think();
    k = cpu_keys(1);
    if (fguard[1])
        ai_d = 0;
    else
        k = ai_k;
    fighter_update(1, k, ai_d);
    ai_d = 0;
}

u8 tick_heavy; // 1 = um golpe acertou neste quadro (o mais pesado): o desenho fica para o proximo
u8 hs0;


void hist_push(u8 i, u16 keys)
{
    u8 h = (hist_hd[i] + 1) & 31;
    hist_hd[i] = h;
    dir_hist[(i << 5) + h] = rel_dir(i, keys);
}

// P2: CPU (Practice/Arcade) ou o 2o controle (Versus)
void p2_update(u16 d)
{
    if (game_mode != MODE_VERSUS)
    {
        cpu_update();
        return;
    }
    hist_push(1, in_k2);
    fighter_update(1, in_k2, d);
}

void fight_tick(u16 dn)
{
    gclk++;
    tick_heavy = 0;
    hs0 = hitstop;
    if (spark_t)
    {
        spark_t++;
        if (spark_t > 10)
            spark_t = 0;
    }
    if (hitstop)
    {
        // durante o hitstop a logica congela, mas o que o jogador aperta fica guardado (botoes) e registrado
        // (direcoes): assim da para cancelar um golpe em especial ja durante a pausa do impacto
        down_buf |= dn;
        down_buf2 |= in_d2;
        hist_push(0, in_k1);
        if (game_mode == MODE_VERSUS)
            hist_push(1, in_k2);
        hitstop--;
    }
    else
    {
        hist_push(0, in_k1);
        PROF(tq0);
        fighter_update(0, in_k1, dn | down_buf);
        PROF(tq1);
        down_buf = 0;
        p2_update(in_d2 | down_buf2);
        down_buf2 = 0;
        PROF(tq2);
        proj_update();
        PROF(tq3);
        resolve_bodies();
        PROF(tq4);
        // velocidade global: a cada 5 quadros roda um passo de logica a mais (jogo ~20% mais rapido)
        speed_acc++;
        if (speed_acc >= SPEED_EVERY && !hitstop)
        {
            speed_acc = 0;
            hist_push(0, in_k1);
            fighter_update(0, in_k1, 0);
            p2_update(0);
            proj_update();
            resolve_bodies();
        }
        if (hitstop && !hs0)
            tick_heavy = 1; // acertou agora: a acao congela (hitstop), o desenho deste quadro pode esperar
    }
}


//---------------------------------------------------------------------------------
// ROUNDS (Arcade e Versus): ROUND n -> FIGHT! -> luta -> K.O. -> YOU WIN / YOU LOSE / DRAW GAME. Melhor de 3.
// Letreiros: tiles 2bpp (res/ann.bin) no lugar dos tiles do debug (o debug so existe no Practice), BG3 paleta 3.
#define ANN_TILE0 DBG_TILE0
u8 ann_row = 10; // linha de tiles do letreiro
#define ANN_ROW ann_row
enum { RS_INTRO, RS_FIGHT, RS_KO, RS_RESULT };
u8 rstate, rtimer, rnum, rwins[2], ann_dirty, rwinner;

void ann_load(void)
{
    dmaCopyVram(&ann_gfx, VRAM_BG3_GFX + (ANN_TILE0 << 3), (&ann_end - &ann_gfx));
    set_color(13, 0x021F); // metade de baixo: laranja
    set_color(14, 0x0808); // contorno: vinho escuro
    set_color(15, 0x4BFF); // metade de cima: amarelo claro
}

void ann_clear(void)
{
    memset(&map3[ANN_ROW << 5], 0, 3 * 64);
    ann_dirty = 1;
}

// poe o letreiro 'id' na coluna x (tiles)
void ann_put(u8 id, u8 x)
{
    u8 r, c, w = ann_w[id];
    u16 k, t = ANN_TILE0 + ann_t0[id];
    for (r = 0; r < 3; r++)
    {
        k = ((ANN_ROW + r) << 5) + x;
        for (c = 0; c < w; c++)
            map3[k++] = (t++) | (3 << 10) | PRIO;
    }
    ann_dirty = 1;
}

void ann_show(u8 id)
{
    ann_clear();
    ann_put(id, (32 - ann_w[id]) >> 1);
}

void ann_round(void)
{
    u8 n = rnum, x;
    if (n > 9)
        n = 9;
    ann_clear();
    x = (32 - ann_w[ANN_ROUND] - 1 - ann_w[ANN_D0]) >> 1;
    ann_put(ANN_ROUND, x);
    ann_put(ANN_D0 + n, x + ann_w[ANN_ROUND] + 1);
}

// fade por brilho (INIDISP): a tela fica 100% preta enquanto os lutadores voltam para o lugar
void fade_out(void)
{
    u8 b;
    for (b = 15; b > 0; b--)
    {
        fx_frame();
        fx_bright(b - 1);
        fx_frame();
    }
}

void fade_in(void)
{
    u8 b;
    for (b = 1; b <= 15; b++)
    {
        fx_frame();
        fx_bright(b);
        fx_frame();
    }
}

// bolinhas de vitoria embaixo da barra de vida (linha 3): P1 na esquerda, P2 na direita
void draw_wins(void)
{
    u8 j;
    for (j = 0; j < 2; j++)
    {
        map3[(HUD_WIN << 5) + 2 + j] = (37 + (rwins[0] > j)) | PRIO | 0x800;
        map3[(HUD_WIN << 5) + 29 - j] = (37 + (rwins[1] > j)) | PRIO | 0x800;
    }
    hud_dirty = 1;
}

//---------------------------------------------------------------------------------
// PAUSE (START). Arcade/Versus: letreiro PAUSE, tudo congela (fisica, animacao, tempo) ate o proximo START.
// Practice: START abre o menu de treino (CPU Anti-Throw sim/nao, Power Gauge liga/desliga); a luta tambem fica parada.
void men_draw(u8 sel)
{
    u8 v, x;
    memset(&map3[6 << 5], 0, 16 * 64);
    ann_row = 6;
    ann_put(ANN_CPUAT, (32 - ann_w[ANN_CPUAT]) >> 1);
    v = ANN_NO;
    if (cpu_tech)
        v = ANN_YES;
    x = (32 - ann_w[v]) >> 1;
    ann_row = 9;
    ann_put(v, x);
    if (sel == 0)
        ann_put(ANN_ARROW, x - ann_w[ANN_ARROW] - 1);
    ann_row = 13;
    ann_put(ANN_PGAUGE, (32 - ann_w[ANN_PGAUGE]) >> 1);
    v = ANN_OFF;
    if (pg_lock)
        v = ANN_ON;
    x = (32 - ann_w[v]) >> 1;
    ann_row = 16;
    ann_put(v, x);
    if (sel == 1)
        ann_put(ANN_ARROW, x - ann_w[ANN_ARROW] - 1);
    ann_row = 19;
    x = (32 - ann_w[ANN_EXIT]) >> 1;
    ann_put(ANN_EXIT, x);
    if (sel == 2)
        ann_put(ANN_ARROW, x - ann_w[ANN_ARROW] - 1);
    ann_row = 10;
}

// troca os tiles do BG3 com a tela apagada (so o DMA grande: 'menu' = letreiros, senao = tiles do debug)
void pause_gfx(u8 menu)
{
    fx_frame();
    REG_HDMAEN = 0;
    *(vuint8 *)0x2100 = 0x80; // tela apagada: o DMA pode passar do vblank
    if (menu)
        ann_load();
    else
        dmaCopyVram(&dbg_bin, VRAM_BG3_GFX + (DBG_TILE0 << 3), (&dbg_bin_end - &dbg_bin));
    bars_on();
}

// devolve 1 = escolheu EXIT no menu de treino (volta para a selecao)
u8 fight_pause(void)
{
    u8 sc = sfx_cur, sel = 0, menu = (game_mode == MODE_PRACTICE), ex = 0, k;
    // termina o envio dos quadros grandes (um quadro de golpe do DonLee passa de um vblank): pausar no meio deixava o desenho
    // pela metade (pedacos do lutador faltando) ate despausar
    for (k = 0; k < 4; k++)
    {
        fight_draw();
        fx_frame();
        do_uploads();
    }
    if (menu)
    {
        if (dbg_on || dbg_pr0 != 255)
        {
            dbg_on = 0; // o desenho de hitboxes some (R liga de novo)
            dbg_frame();
            fx_frame();
            dbg_upload();
        }
        pause_gfx(1);
    }
    sfx_set_pause();
    play_sfx(SFX_PAUSE);
    if (menu)
        men_draw(0);
    else
        ann_show(ANN_PAUSE);
    while (1)
    {
        fx_frame();
        if (ann_dirty)
        {
            dmaCopyVram((u8 *)&map3[6 << 5], VRAM_BG3_MAP + (6 << 5), 16 * 64);
            ann_dirty = 0;
        }
        if (hud_dirty2)
        {
            dmaCopyVram((u8 *)&map3[HUD_SP << 5], VRAM_BG3_MAP + (HUD_SP << 5), 128);
            hud_dirty2 = 0;
        }
        if (pad_down & (KEY_START | (menu ? KEY_B : 0)))
            break;
        if (menu)
        {
            if (pad_down & KEY_DOWN)
            {
                sel++;
                if (sel > 2)
                    sel = 0;
                play_sfx(SFX_MOVE);
                men_draw(sel);
            }
            if (pad_down & KEY_UP)
            {
                if (sel)
                    sel--;
                else
                    sel = 2;
                play_sfx(SFX_MOVE);
                men_draw(sel);
            }
            if ((pad_down & KEY_A) && sel == 2)
            {
                ex = 1;
                break;
            }
            if ((pad_down & (KEY_LEFT | KEY_RIGHT | KEY_A)) && sel < 2)
            {
                play_sfx(SFX_MOVE);
                if (sel == 0)
                    cpu_tech = cpu_tech ? 0 : 1;
                else
                {
                    pg_lock ^= 1;
                    if (pg_lock)
                    {
                        fstock[0] = fstock[1] = 3;
                        fgauge[0] = fgauge[1] = 0;
                        draw_super(0);
                        draw_super(1);
                    }
                }
                men_draw(sel);
            }
        }
    }
    memset(&map3[6 << 5], 0, 16 * 64);
    ann_dirty = 1;
    fx_frame();
    dmaCopyVram((u8 *)&map3[6 << 5], VRAM_BG3_MAP + (6 << 5), 16 * 64);
    ann_dirty = 0;
    if (menu)
        pause_gfx(0);
    if (ex)
        return 1;
    if (sc == 2)
        sfx_set_fight(fchar[0], fchar[1]);
    else if (sc >= 3 && sc < 6)
        sfx_set_voices(sc - 3);
    ann_row = 10;
    fx_frame(); // (START ainda apertado: pad_down limpo antes de voltar)
    return 0;
}

void round_begin(void)
{
    rstate = RS_INTRO;
    rtimer = 0;
    ctl_on = 0;
    draw_wins();
}

// um quadro do fluxo do round. Devolve 1 (P1 venceu a partida), 2 (P1 perdeu), 3 (proximo round) ou 0
u8 round_step(void)
{
    rtimer++;
    if (rstate == RS_INTRO)
    {
        if (rtimer == 20)
        {
            ann_round();             // "ROUND n"
            play_sfx(SFX_V_ROUND);
        }
        else if (rtimer == 55 && rnum <= 3)
            play_sfx(SFX_V_ONE + rnum - 1);
        else if (rtimer == 120)
        {
            ann_show(ANN_FIGHT);     // ~1 s depois: "FIGHT!"
            play_sfx(SFX_V_FIGHT);
        }
        else if (rtimer == 185)
        {
            sfx_async = 1; // golpes e vozes dos lutadores: chegam 1 efeito por quadro, sem pausa (o FIGHT! fica na tela)
            sfx_set_fight(fchar[0], fchar[1]);
            sfx_async = 0;
        }
        else if (rtimer > 185 && sfx_k >= sfx_n)
        {
            ann_clear();
            ctl_on = 1;              // controles liberados so depois do FIGHT!
            rstate = RS_FIGHT;
        }
    }
    else if (rstate == RS_FIGHT)
    {
        if (fko[0] | fko[1])
        {
            ctl_on = 0;              // K.O.: ninguem mais controla
            rstate = RS_KO;
            rtimer = 0;
        }
    }
    else if (rstate == RS_KO)
    {
        // o derrotado grita ao cair (grito no conjunto da luta); depois, parado no chao, troca para as vozes do resultado
        if (rtimer == 165)
        {
            sfx_async = 1;
            sfx_set_voices(1);
            sfx_async = 0;
        } // (a camera lenta do golpe final dura ~1,2 s; o derrotado ja esta no chao)
        if (rtimer == 170 && !(fko[0] && fko[1]))
        {
            // fim da camera lenta: o vencedor sai do combate e faz a pose de vitoria (do spritesheet, A_VICTORY)
            rwinner = fko[0];
            fwin[rwinner] = 1;
            play_anim(rwinner, A_VICTORY, A_VICTORY_N, 8);
            fatk[rwinner] = NOATK;
        }
        if (rtimer >= 205)
        {
            rstate = RS_RESULT;
            rtimer = 0;
            if (fko[0] && fko[1])
            {
                rwinner = 2;
                ann_show(ANN_DRAW);  // empate: ninguem ganha bolinha, round extra
            }
            else
            {
                rwinner = fko[0];    // 0 = P1 venceu
                rwins[rwinner]++;
                draw_wins();
                if (rwinner == 0)
                {
                    ann_show(ANN_WIN);
                    play_sfx(SFX_V_WIN);
                }
                else
                {
                    ann_show(ANN_LOSE);
                    play_sfx(SFX_V_LOSE);
                }
            }
        }
    }
    else if (rtimer == 70 && rwinner < 2 && fhp[rwinner] == HP_MAX)
    {
        // vitoria sem levar nenhum dano: depois do YOU WIN, "PERFECT!"
        ann_row = 14;
        ann_show(ANN_PERFECT);
        ann_row = 10;
        play_sfx(SFX_V_PERFECT);
    }
    else if (rtimer >= 170)
    {
        if (rwins[0] >= 2)
            return 1;
        if (rwins[1] >= 2)
            return 2;
        return 3;
    }
    return 0;
}

u8 fight_run(void)
{
    u8 i;
    u16 r;
    game_screen = 3;
    prof_ovr = 0;
    busy_max = busy_sum = busy_avg = busy_n = 0;
    memset(busy_h, 0, 18);
    memset(pmax, 0, 16);
    memset(psum, 0, 16);
    pcnt = 0;
    memset(ovr_hist, 0, 80);
    oam_last = 0;
    for (i = 0; i < 7; i++)
    {
        oam_n[i] = 0;
        oc_f[i] = 255;
    }
    dc_f[0] = dc_f[1] = 254; // forca o primeiro desenho
    oam_base[0] = 4;
    oam_base[1] = 28;
    oam_base[2] = 52;
    oam_base[3] = 56;
    oam_base[4] = 60;
    oam_base[5] = 64;
    oam_base[6] = 0;
    front = 0;
    pk_load_frames();   // tabelas de quadros e blocos de graficos (do pack)
    // personagens escolhidos: o quadro real de cada objeto = quadro logico (A_*) + o comeco do personagem na tabela
    for (i = 0; i < 2; i++)
    {
        fgfx[i] = sel_char[i];
        pk_load_moves(i, fgfx[i]); // golpes e tracos do lutador (do pack)
        fdsw[i] = TR(i, TRK_DIRSWAP);
        fpal_a[i] = TR(i, TRK_PAL_ASSET);
        pk_asset(fpal_a[i], 0, 32);
        fsw_src[i << 1] = pk_src;
        fsw_src[(i << 1) + 1] = pk_src + 32;
        fsw_bank[i] = pk_bank;
        fchar[i] = TR(i, TRK_MOVESET);   // conjunto de golpes especiais: 0 = estilo Ryu, 1 = estilo Sagat
        choff[i] = TR(i, TRK_FRAME_BASE);
        obj_off[i] = choff[i];
        obj_off[2 + i] = TR(i, TRK_FX_BASE);   // a magia do lutador (o DonLee usa a do Ryu)
        obj_off[4 + i] = 0;
        flow[i] = 0;
        pj_alt[i] = FB_ALT;
    }
    obj_off[6] = 0;
    if (game_mode == MODE_PRACTICE)
        sfx_set_fight(fchar[0], fchar[1]);
    else
        sfx_set_voices(0); // Arcade/Versus: comeca pelas vozes do anunciante (a luta carrega os golpes depois do FIGHT!)
    fight_gfx_init();
    fighters_reset();
    ai_on = (game_mode == MODE_ARCADE); // Arcade: a CPU luta
    rnum = 1;
    rwins[0] = rwins[1] = 0;
    ann_dirty = 0;
    ctl_on = 1;
    down_buf2 = 0;
    if (game_mode != MODE_PRACTICE)
    {
        ann_load();
        round_begin();
    }
    ai_t = 0;
    ai_k = 0;
    ai_d = 0;
    ai_seed = 0xACE1;
    dmaCopyVram((u8 *)map3, VRAM_BG3_MAP, 2048);
    hud_dirty = 0;
    hud_dirty2 = 0;
    flash_t = flash_on = flash_black = flash_red = 0;
    fpp[0] = fpp[1] = 0;
    slow_t = 0; // (era lixo no inicio da luta: camera lenta aleatoria)
    fhop[0] = fhop[1] = tap_d[0] = tap_d[1] = fdash[0] = fdash[1] = 0;
    gclk = 1000;
    hop_at[0] = hop_at[1] = tap_at[0] = tap_at[1] = 0;
    cpu_tech = 1;   // Practice: SIM (muda no menu); Arcade: 2 = quase sempre
    if (game_mode == MODE_ARCADE)
        cpu_tech = 2;
    pg_lock = 0;
    dark_lvl = 0;
    fsuper[0] = fsuper[1] = pj_super[0] = pj_super[1] = 0;
    sc_on[0] = sc_on[1] = 0;
    lag_frames = 0;
    last_vb = snes_vblank_count;
    dbg_on = 0;
    dbg_r0 = 255;
    dbg_r1 = 0;
    dbg_pr0 = 255;
    dbg_pr1 = 0;
    dbg_up0 = 255;
    dbg_up_comp = 0;
    dbg_force = 0;
    dbg_cool = 0;
    dbg_last_sig = 0;
    dbg_comp_n = 0;
    bgSetScroll(0, cam, SCENE_DY);
    plan_frames();
    fight_draw();
    do_uploads();
    setBrightness(15);
    bars_on();

    reveal_screen();
    while (1)
    {
        if ((pad_down & KEY_START) && ctl_on && fight_pause())
        {
            cover_screen(1);   // (so Practice) EXIT do menu de treino: volta para a selecao
            bars_off();
            return 0;
        }
        if (game_mode != MODE_PRACTICE)
        {
            r = round_step();
            if (r == 3)
            {
                // proximo round: a tela escurece (fade), e so com ela 100% preta os lutadores voltam ao lugar. As bolinhas
                // de super acumuladas passam para o proximo round
                u8 g0 = fgauge[0], g1 = fgauge[1], s0 = fstock[0], s1 = fstock[1];
                fade_out();
                rnum++;
                sfx_set_voices(0);
                fighters_reset();
                // estado de desenho zerado com a tela preta: nenhum quadro (ex.: o Sagat caido) fica "meio enviado" ou em cache
                for (i = 0; i < 7; i++)
                {
                    fwant[i] = 255;
                    fshown[i] = 255;
                    oc_f[i] = 255;
                }
                for (i = 0; i < 2; i++)
                {
                    up_t[i] = 255;
                    plan_ch[i] = 0;
                    sbuf[i] = 0;
                }
                up_n = 0;
                up_used = 0;
                ann_row = 14;
                ann_clear(); // (o PERFECT! do round anterior fica 2 linhas abaixo do YOU WIN)
                ann_row = 10;
                fgauge[0] = g0;
                fgauge[1] = g1;
                fstock[0] = s0;
                fstock[1] = s1;
                super_full(0);
                super_full(1);
                slow_t = 0;
                bgSetScroll(0, cam, SCENE_DY); // camera de volta ao ponto zero ainda com a tela preta (o registrador so mudava no loop)
                set_cam_scroll();
                ann_clear();
                dmaCopyVram((u8 *)map3, VRAM_BG3_MAP, 2048);
                dc_f[0] = dc_f[1] = 254;
                plan_frames();
                fight_draw();
                do_uploads();
                round_begin();
                ann_dirty = 0;
                dmaCopyVram((u8 *)map3, VRAM_BG3_MAP, 2048);
                dmaCopyVram((u8 *)hud2_row, VRAM_BG2_MAP + (HUD_HP << 5), 64);
                hud2_dirty = 0;
                fade_in();
                continue;
            }
            if (r)
            {
                cover_screen(0);
                bars_off();
                return r;      // 1 = P1 venceu a partida, 2 = perdeu
            }
        }
        in_k1 = pad;
        in_k2 = pad2;
        in_d2 = pad2_down;
        r = pad_down;
        if (!ctl_on)
        {
            in_k1 = in_k2 = in_d2 = r = 0; // controles travados (ROUND/FIGHT!, depois do K.O.)
        }
        if ((pad_down & KEY_SELECT) && game_mode == MODE_PRACTICE)
        {
            ai_on ^= 1;        // SELECT liga/desliga a CPU do P2
            ai_t = 0;
            ai_k = 0;
            ai_d = 0;
            play_sfx(SFX_MOVE);
        }
        PROF(prof_d);
        slow_skip = 0;
        if (slow_t)
        {
            slow_t--;
            if (slow_t & 3)
                slow_skip = 1; // camera lenta: so 1 quadro de logica a cada 4
        }
        if (!slow_skip)
            fight_tick(r);
        if (pg_lock)
        {
            if (fstock[0] != 3)
            {
                fstock[0] = 3; // Power Gauge ligado: barra de super sempre no maximo
                fgauge[0] = 0;
                draw_super(0);
            }
            if (fstock[1] != 3)
            {
                fstock[1] = 3;
                fgauge[1] = 0;
                draw_super(1);
            }
        }
        if (game_mode != MODE_PRACTICE || rv[0] != fhp[0] || rv[1] != fhp[1])
            red_update();
        PROF(prof_e);
#if FRAME_VBLANKS == 2
        fight_tick(0);
#endif
        PROF(prof_f);
        if ((pad_down & KEY_R) && game_mode == MODE_PRACTICE)
        {
            dbg_on ^= 1;
            dbg_force = 1;
        }
        // quadro em que um golpe acertou (o mais pesado da logica): como o acerto congela a acao (hitstop), o desenho
        // fica para o proximo quadro (a imagem seria a mesma) e o jogo nao atrasa
        if (!tick_heavy && !slow_skip)
            fight_draw();
        if (dbg_on)
        {
            r = dbg_sig();
            if (dbg_cool)
                dbg_cool--; // no maximo uma remontagem a cada 2 quadros (o desenho atrasa no maximo 1 quadro)
            else if (dbg_force || r != dbg_last_sig)
            {
                dbg_frame();
                dbg_last_sig = r;
                dbg_force = 0;
                dbg_cool = 1;
            }
        }
        else if (dbg_pr0 != 255)
            dbg_frame();
        PROF(prof_g);
#if PROFILING
        {
            s16 bz = prof_g - prof_d;
            if (bz < 0)
                bz += 262;
            if (bz > busy_max)
                busy_max = bz;
            busy_sum += bz;
            busy_h[bz >> 5]++;
            {
                u16 v[8];
                u8 q;
                v[0] = lines(prof_d, prof_e); // fight_tick
                v[1] = lines(tq0, tq1);       // fighter_update P1
                v[2] = lines(tq1, tq2);       // cpu_update (P2)
                v[3] = lines(tq2, tq3);       // proj_update
                v[4] = lines(tq3, tq4);       // resolve_bodies + camera
                v[5] = lines(pq0, pq1);       // plan_frames
                v[6] = lines(pq1, pq3);       // draw_obj (lutadores, sombras, bolas)
                v[7] = bz;                    // quadro inteiro (logica + desenho)
                for (q = 0; q < 8; q++)
                {
                    if (v[q] > pmax[q])
                        pmax[q] = v[q];
                    psum[q] += v[q];
                }
                pcnt++;
                tq0 = tq1 = tq2 = tq3 = tq4 = 0;
            }
            sec_sum[0] += lines(prof_d, prof_e);
            sec_sum[1] += lines(pq0, pq1);
            sec_sum[2] += lines(pq1, pq2);
            sec_sum[3] += lines(pq2, pq3);
            sec_sum[4] += lines(pq3, prof_g);
            sec_sum[5] += lines(prof_e, pq0);
            if (++busy_n >= 64)
            {
                busy_avg = busy_sum >> 6;
                for (bz = 0; bz < 6; bz++)
                {
                    sec_avg[bz] = sec_sum[bz] >> 6;
                    sec_sum[bz] = 0;
                }
                busy_sum = 0;
                busy_n = 0;
            }
        }
#endif
        logic_frames++;
        if (snes_vblank_count - last_vb >= FRAME_VBLANKS)
            lag_frames++; // passou do vblank: o quadro atrasou
        fx_frame(); // espera o vblank (e le o controle)
        last_vb = snes_vblank_count;
        acc_down = pad_down;
        set_cam_scroll();
        // vblank: tiles dos quadros novos e a barra de energia
        PROF(prof_a);
        do_uploads();
#if PROFILING
        plan_used = up_used;
        PROF(prof_b);
        {
            u16 dd = prof_b;
            if (dd < 200)
                dd += 262;
            dd -= prof_a;
            if (dd > ovr_hist[plan_used])
                ovr_hist[plan_used] = dd;
        }
        if (prof_b < 200)
            prof_ovr++; // o envio passou do fim do vblank (teste)
#endif
        if (dbg_up0 != 255 || dbg_up_comp)
            dbg_upload();
        PROF(prof_c);
        // Boxer: virado para a esquerda, as luvas trocam de cor (azul <-> vermelho): so a paleta muda (32 bytes), o desenho e o
        // mesmo espelhado
        for (i = 0; i < 2; i++)
            if (fdsw[i] && bx_dir[i] != fdir[i])
            {
                pk_t = (i << 1) + fdir[i];
                pk_src = fsw_src[pk_t];
                pk_bank = fsw_bank[i];
                pk_n = 32;
                pk_dst = 128 + (i << 4);
                sf_cgram();
                bx_dir[i] = fdir[i];
            }
        if (pal_pend[0] | pal_pend[1])
        {
            for (i = 0; i < 2; i++)
                if (pal_pend[i])
                {
                    pk_t = TR(i, TRK_FBPAL_OFF2);
                    if (pal_pend[i] == 1)
                        pk_t = TR(i, TRK_FBPAL_OFF1);
                    pk_cgram(TR(i, TRK_FBPAL_ASSET), pk_t, 224 + (i << 4), 32);
                    pal_pend[i] = 0;
                }
        }
        if (hud_dirty2)
        {
            dmaCopyVram((u8 *)&map3[HUD_SP << 5], VRAM_BG3_MAP + (HUD_SP << 5), 128);
            hud_dirty2 = 0;
        }
        if (flash_t)
        {
            REG_COLDATA = 0xFF;  // soma branco em tudo (flash do Contra-Golpe)
            if (flash_red)
            {
                REG_COLDATA = 0x3F; // anti-throw: vermelho (R=31, G=0, B=0)
                REG_COLDATA = 0x40;
                REG_COLDATA = 0x80;
            }
            REG_CGADSUB = 0x3F;
            if (flash_black)
                REG_CGADSUB = 0xBF; // super: subtrai (tela preta)
            flash_t--;
            flash_on = 1;
        }
        else if (dark_lvl)
        {
            // Super: cenario (BG1 + fundo) 40% mais escuro; lutadores, magias e HUD ficam por cima, sem escurecer.
            // Segura ~0,7 s e volta ao normal aos poucos
            REG_COLDATA = 0xE0 | dark_lvl;
            REG_CGADSUB = 0xA1;
            flash_on = 1;
            dark_c++;
            if (dark_c >= 40 && !(dark_c & 3))
                dark_lvl--; // a cada 4 quadros um nivel a menos (fade suave de volta)
        }
        else if (flash_on)
        {
            REG_CGADSUB = 0;
            flash_on = 0;
            flash_black = 0;
            flash_red = 0;
        }
        if (hud_dirty)
        {
            dmaCopyVram((u8 *)&map3[HUD_HP << 5], VRAM_BG3_MAP + (HUD_HP << 5), 128); // barras (linha 2) e bolinhas (linha 3)
            hud_dirty = 0;
        }
        if (hud2_dirty)
        {
            dmaCopyVram((u8 *)hud2_row, VRAM_BG2_MAP + (HUD_HP << 5), 64);
            hud2_dirty = 0;
        }
        if (ann_dirty)
        {
            dmaCopyVram((u8 *)&map3[10 << 5], VRAM_BG3_MAP + (10 << 5), 7 * 64); // linhas 10-16: letreiro e o PERFECT! embaixo
            ann_dirty = 0;
        }
#if FRAME_VBLANKS == 2
        fx_frame(); // 2o vblank do quadro (30 quadros por segundo)
        set_cam_scroll();
        pad_down |= acc_down;
#endif
        i = 0;
    }
}

//---------------------------------------------------------------------------------
// ARCADE: escada de oponentes (CPU), Continue e final
#define ARC_N 2   // oponentes: primeiro o outro lutador, depois o espelho
u8 arc_stage;
u16 gbuf[16];

u16 gray(u16 c)
{
    u16 y = ((c & 31) * 5 + ((c >> 5) & 31) * 9 + ((c >> 10) & 31) * 2) >> 4;
    return y | (y << 5) | (y << 10);
}

// retrato do P1 no meio da tela de cima (Continue e final)
void p1_face_screen(void)
{
    screen_base();
    faces_load();
    set_color(0, 0);
    face_put(12, 3, FTC(sel_char[0], TRK_FACE_PAL), 0, sel_char[0]);
    dmaCopyVram((u8 *)map1, VRAM_BG1_MAP, 2048);
}

// Continue: 9..0, um numero por segundo; START (9 a 1) volta para a selecao. Chegou a 0: GAME OVER em preto e
// branco e fade para o titulo. Devolve 1 = continuar
u8 continue_run(void)
{
    u8 n, t, fp;
    u16 i;
    game_screen = 4;
    sfx_set_voices(2);
    p1_face_screen();
    ann_load();
    ann_row = 15;
    ann_show(ANN_CONT);
    ann_row = 19;
    ann_show(ANN_D9);
    dmaCopyVram((u8 *)map3, VRAM_BG3_MAP, 2048);
    setBrightness(15);
    reveal_screen();
    n = 9;
    while (1)
    {
        ann_show(ANN_D0 + n);
        if (n)
            play_sfx(SFX_V_C9 + 9 - n); // no 0 nao toca nada de menu: so o game over (abaixo)
        for (t = 0; t < 60; t++)
        {
            fx_frame();
            if (ann_dirty)
            {
                dmaCopyVram((u8 *)map3, VRAM_BG3_MAP, 2048);
                ann_dirty = 0;
            }
            if ((pad_down & KEY_START) && n)
            {
                play_sfx(SFX_OK);
                ann_row = 10;
                cover_screen(0);
                return 1;
            }
        }
        if (!n)
            break;
        n--;
    }
    // GAME OVER: letreiro, tudo em preto e branco, fade out
    ann_row = 15;
    ann_show(ANN_OVER);
    play_sfx(SFX_KO); // (sem a voz do "game over" ainda)
    fp = FTC(sel_char[0], TRK_GAMEOVER_FP);
    for (i = 0; i < 16; i++)
        gbuf[i] = gray(fpal[(fp << 4) + i]);
    fx_frame();
    dmaCopyVram((u8 *)map3, VRAM_BG3_MAP, 2048);
    dmaCopyCGram((u8 *)gbuf, 32 + (fp << 4), 32);
    set_color(13, gray(0x021F));
    set_color(14, gray(0x0808));
    set_color(15, gray(0x4BFF));
    ann_dirty = 0;
    for (t = 0; t < 120; t++)
        fx_frame();
    for (t = 60; t > 0; t--)
    {
        fx_frame();
        setBrightness((t - 1) >> 2);
    }
    ann_row = 10;
    menu_fade = 1;
    return 0;
}

// final do Arcade: retrato do P1 e "Parabens", depois o titulo
void ending_run(void)
{
    u16 t;
    game_screen = 5;
    sfx_set_menu();
    p1_face_screen();
    fx_text(fx_block_ending(), 16, 0, 1, map3, VRAM_BG3_GFX);
    dmaCopyVram((u8 *)map3, VRAM_BG3_MAP, 2048);
    setBrightness(15);
    reveal_screen();
    for (t = 0; t < 360; t++)
    {
        fx_frame();
        if (t > 60 && (pad_down & (KEY_B | KEY_START)))
            break;
    }
    for (t = 60; t > 0; t--)
    {
        fx_frame();
        setBrightness((t - 1) >> 2);
    }
    menu_fade = 1;
}

// Arcade depois da escolha do P1. Devolve 1 = escolher de novo (continue / START na luta), 0 = titulo
u8 arcade_run(void)
{
    u8 r;
    while (1)
    {
        sel_char[1] = sel_char[0];
        if (arc_stage == 0)
        {
            sel_char[1] = FTC(sel_char[0], TRK_ARCADE_OPP); // 1o oponente (Ryu <-> Sagat; o DonLee enfrenta o Ryu)
        }
        vs_run();
        r = fight_run();
        if (r == 0)
        {
            arc_stage = 0;
            return 1;
        }
        if (r == 1)
        {
            arc_stage++;
            if (arc_stage >= ARC_N)
            {
                ending_run();
                arc_stage = 0;
                return 0;
            }
            continue;
        }
        if (continue_run())
            return 1;  // mesma fase, pode trocar de lutador
        arc_stage = 0;
        return 0;
    }
}

//---------------------------------------------------------------------------------
int main(void)
{
    u8 r;
    setScreenOff();
    pk_boot();                 // cabecalho e tabela de assets do pack
    pad = pad_last = pad_down = 0;
    spcBoot();                 // liga o chip de som (leva alguns quadros)
    spcSetBank(&SOUNDBANK__);
    sfx_cur = 0;
    sfx_k = sfx_n = sfx_async = 0;
    dark_lvl = dark_c = 0;
    game_mode = MODE_PRACTICE;
    menu_fade = 0;
    ann_row = 10;
    pad2 = pad2_last = pad2_down = 0;
    menu_boot();               // opcoes salvas (SRAM) ou o padrao
    while (1)
    {
        menu_run();            // splash (ao ligar) -> titulo; volta com o modo escolhido (game_mode)
        arc_stage = 0;
        while (1)
        {
            r = select_run();  // 0 = A na selecao: volta ao titulo
            if (!r)
                break;
            if (game_mode == MODE_ARCADE)
            {
                if (!arcade_run())
                    break;
                continue;
            }
            vs_run();
            fight_run();       // START (ou o fim da partida no Versus) volta para a selecao
        }
    }
    return 0;
}
