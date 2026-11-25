/*---------------------------------------------------------------------------------
    Street Combat - telas fora da luta (spec "Street Combat v0.0.1"): splash, titulo, creditos, opcoes

    Fluxo: splash (so ao ligar) -> titulo -> Practice (selecao -> VS -> luta) / Credits / Options.
    Arcade Game e Versus Mode aparecem em cinza (desabilitados: o cursor pula os dois).

    Camadas (modo 1, tiles 8x8), fundo preto:
        BG1  logotipo STREET COMBAT (4bpp, paleta 2)
        BG3  textos (2bpp: so o plano 0 = cor 1 da paleta; prioridade alta)
        OBJ  cursor '>'
    Textos: idiomas/textos.tsv (dicionario central pt/es/en/ja) -> res/txt_N.bin (tools/mkassets.py).
    Troca de tela: caixa preta (janela de cor) cobre, a tela nova e montada por baixo e a caixa sai.
    Splash: fade pelo brilho (INIDISP, trocado so no vblank: sem piscar).
    Nas opcoes, trocar idioma/botao/volume so mexe no mapa (tiles ja na VRAM); o idioma vale ao sair.
    Opcoes salvas na SRAM do cartucho (bateria).
---------------------------------------------------------------------------------*/
#include <snes.h>
#include <string.h>

#include "res/menu.h"
#include "src/sfx.h"

extern u16 pad, pad_down, pad_last;
extern u8 game_screen, game_mode, menu_fade;
void oam_hide_all(void);
void set_color(u8 idx, u16 bgr);
void sfx_set_menu(void);

#define MV_BG1_GFX 0x0000
#define MV_BG1_MAP 0x1800
#define MV_BG3_MAP 0x1C00
#define MV_BG3_GFX 0x2000
#define MV_OBJ_GFX 0x6000
#define TXT_TILE0 64
#define PRIO 0x2000
#define P_WHITE 0
#define P_GREY 1
#define P_GREEN 2
#define P_YELLOW 3
#define P_FOOT 4

//---------------------------------------------------------------------------------
// configuracao (salva na SRAM)
u8 lang, bgm_lv, sfx_lv; // volumes em niveis 0..10 (= 0..100 na tela)
u8 key_of[5];            // botao (0..5 = B Y A X L R) de: soco fraco, soco forte, chute fraco, chute forte, arremesso
u16 km_phys[5];          // o mesmo em bits do controle (a luta traduz com key_map, src/drawobj.asm)
u16 km_free;             // KEY_R se o R estiver livre (continua ligando o debug), senao 0
u16 km_raw, km_out;
u8 sfx_hw;               // volume dos efeitos no formato do spcEffect (volume << 4 | 8)
const u16 phys_key[6] = {KEY_B, KEY_Y, KEY_A, KEY_X, KEY_L, KEY_R};
// volume em curva (o ouvido nao e linear). Musica 0..255 = (nivel/10)^2; efeitos: so 16 volumes no SNESMOD
const u8 sfx_curve[11] = {0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15};
const u8 bgm_curve[11] = {0, 3, 10, 23, 41, 64, 92, 125, 163, 207, 255};
u8 cfg[16]; // SRAM: "SC01", idioma, musica, efeitos, 5 botoes, soma

void cfg_apply(void)
{
    u8 a, k;
    km_free = KEY_R;
    for (a = 0; a < 5; a++)
    {
        k = key_of[a];
        km_phys[a] = phys_key[k];
        if (k == 5)
            km_free = 0;
    }
    sfx_hw = (sfx_curve[sfx_lv] << 4) | 8;
    spcSetModuleVolume(bgm_curve[bgm_lv]);
}

void keys_default(void)
{
    u8 a;
    for (a = 0; a < 5; a++)
        key_of[a] = a;
}

u8 cfg_sum(void)
{
    u8 i, s = 0x5A;
    for (i = 4; i < 12; i++)
        s += cfg[i];
    return s;
}

void cfg_save(void)
{
    u8 i;
    cfg[0] = 'S';
    cfg[1] = 'C';
    cfg[2] = '0';
    cfg[3] = '1';
    cfg[4] = lang;
    cfg[5] = bgm_lv;
    cfg[6] = sfx_lv;
    for (i = 0; i < 5; i++)
        cfg[7 + i] = key_of[i];
    cfg[12] = cfg_sum();
    consoleCopySram(cfg, 16);
}

u8 cfg_load(void)
{
    u8 i, j;
    consoleLoadSram(cfg, 16);
    if (cfg[0] != 'S')
        return 0;
    if (cfg[1] != 'C')
        return 0;
    if (cfg[2] != '0')
        return 0;
    if (cfg[3] != '1')
        return 0;
    if (cfg[12] != cfg_sum())
        return 0;
    if (cfg[4] >= LANG_COUNT)
        return 0;
    if (cfg[5] > 10)
        return 0;
    if (cfg[6] > 10)
        return 0;
    for (i = 0; i < 5; i++)
    {
        if (cfg[7 + i] > 5)
            return 0;
        for (j = 0; j < i; j++)
            if (cfg[7 + i] == cfg[7 + j])
                return 0;
    }
    lang = cfg[4];
    bgm_lv = cfg[5];
    sfx_lv = cfg[6];
    for (i = 0; i < 5; i++)
        key_of[i] = cfg[7 + i];
    return 1;
}

//---------------------------------------------------------------------------------
// transicao (tambem usada pela selecao/VS/luta)
u8 wipe_phase, wipe_t, wipe_rev, wipe_wh0, wipe_wh1, wipe_wsel;
const u8 wipe_ease[21] = {0, 1, 3, 6, 10, 16, 23, 31, 41, 52, 64, 77, 92, 108, 125, 144, 164, 185, 207, 231, 255};
#define WIPE_STEPS 20
#define WIPE_HOLD 12

void wipe_start(u8 reverse)
{
    wipe_phase = 1;
    wipe_t = 0;
    wipe_rev = reverse;
}

u8 wipe_update(void)
{
    u8 e, covered = 0;
    if (!wipe_phase)
        return 0;
    wipe_t++;
    if (wipe_phase == 1 && wipe_t > WIPE_STEPS)
    {
        wipe_phase = 2;
        wipe_t = 0;
        covered = 1;
    }
    else if (wipe_phase == 2 && wipe_t > WIPE_HOLD)
    {
        wipe_phase = 3;
        wipe_t = 0;
    }
    else if (wipe_phase == 3 && wipe_t > WIPE_STEPS)
    {
        wipe_phase = 0;
    }
    wipe_wh0 = 255;
    wipe_wh1 = 0;
    if (wipe_phase == 1)
    {
        e = wipe_ease[wipe_t];
        if (e)
        {
            if (wipe_rev)
            {
                wipe_wh0 = 255 - e;
                wipe_wh1 = 255;
            }
            else
            {
                wipe_wh0 = 0;
                wipe_wh1 = e;
            }
        }
    }
    else if (wipe_phase == 2)
    {
        wipe_wh0 = 0;
        wipe_wh1 = 255;
    }
    else if (wipe_phase == 3)
    {
        e = wipe_ease[wipe_t];
        if (e < 255)
        {
            if (wipe_rev)
            {
                wipe_wh0 = 0;
                wipe_wh1 = 255 - e;
            }
            else
            {
                wipe_wh0 = e;
                wipe_wh1 = 255;
            }
        }
    }
    wipe_wsel = 0;
    if (wipe_phase)
        wipe_wsel = 0xA0;
    return covered;
}

void wipe_regs(void)
{
    REG_WOBJSEL = 0x20;
    REG_WH0 = wipe_wh0;
    REG_WH1 = wipe_wh1;
}

//---------------------------------------------------------------------------------
const u16 zero_menu = 0;

void vram_low(u8 *src, u16 addr, u16 size)
{
    dmaCopyVram7(src, addr, size, 0x00, 0x1800);
}

void vram_clear(u16 addr, u16 words)
{
    dmaCopyVram7((u8 *)&zero_menu, addr, words << 1, 0x80, 0x1809);
}

u16 m3[1024];
u8 dirty_lo, dirty_hi; // linhas do mapa a enviar no vblank: dirty_lo .. dirty_hi-1

void mark_row(u8 r)
{
    if (r < dirty_lo)
        dirty_lo = r;
    if (r >= dirty_hi)
        dirty_hi = r + 1;
}
u16 next_tile;
u8 ln_w, ln_h, ln_xt, ln_xp;

// manda a linha 'i' do bloco de texto para a VRAM e devolve o primeiro tile
u16 line_load(u8 *blk, u8 i)
{
    u8 j, n = blk[0];
    u8 *hdr = blk + 1;
    u8 *data = blk + 1 + (n << 2);
    u16 t, tiles;
    for (j = 0; j < i; j++)
    {
        tiles = hdr[j << 2] * hdr[(j << 2) + 1];
        data += tiles << 3;
    }
    hdr += i << 2;
    ln_w = hdr[0];
    ln_h = hdr[1];
    ln_xt = hdr[2];
    ln_xp = hdr[3];
    tiles = ln_w * ln_h;
    t = next_tile;
    next_tile += tiles;
    vram_low(data, MV_BG3_GFX + (t << 3), tiles << 3);
    return t;
}

void tiles_put(u16 t, u8 row, u8 x, u8 pal, u8 w, u8 h)
{
    u8 r, c;
    u16 k, a = t | (pal << 10) | PRIO;
    for (r = 0; r < h; r++)
    {
        k = ((row + r) << 5) + x;
        for (c = 0; c < w; c++)
            m3[k++] = a++;
        mark_row(row + r);
    }
}

void row_clear(u8 row, u8 x0, u8 x1)
{
    u8 x;
    u16 k = (row << 5) + x0;
    for (x = x0; x < x1; x++)
    {
        m3[k] = 0;
        m3[k + 32] = 0;
        k++;
    }
    mark_row(row);
    mark_row(row + 1);
}

void ui2(u8 x, u8 row, u16 tile, u8 pal)
{
    u16 k = (row << 5) + x;
    u16 a = tile | (pal << 10) | PRIO;
    m3[k] = a;
    m3[k + 32] = a + 1;
    mark_row(row);
    mark_row(row + 1);
}

// texto inteiro a partir da linha 'row'; x = 255: posicao do conversor. Devolve o x (px) da 1a linha
u8 txt_draw(u8 *blk, u8 row, u8 pal, u8 x)
{
    u8 i, xt, x0 = 0, n = blk[0];
    u16 t;
    for (i = 0; i < n; i++)
    {
        t = line_load(blk, i);
        xt = ln_xt;
        if (x != 255)
        {
            xt = x;
            ln_xp = x << 3;
        }
        tiles_put(t, row, xt, pal, ln_w, ln_h);
        if (i == 0)
            x0 = ln_xp;
        row += ln_h;
    }
    return x0;
}

//---------------------------------------------------------------------------------
enum { SCR_SPLASH, SCR_TITLE, SCR_CREDITS, SCR_OPTIONS };
u8 screen, sel, opt_sel, splash_done, pend_lang, menu_idle;
u8 cur_on, scr_bright, fade_b, rep_t;
u16 nav; // direcoes "apertadas" neste quadro (com repeticao)
#define REP_FIRST 15 // ~250 ms
#define REP_NEXT 6   // ~100 ms

#define T_LOGO_ROW 2
#define T_MENU_ROW 13
#define T_FOOT_ROW 25
u8 title_x[5];
const u8 opt_row[10] = {4, 6, 8, 11, 13, 15, 17, 19, 22, 24};
#define OPT_N 10
#define OPT_LABEL_X 3
#define OPT_BAR_X 15
#define OPT_DIG_X 28
#define OPT_ARROW_L 15
#define OPT_ARROW_R 26
#define OPT_HINT_ROW 26
u8 opt_cx[OPT_N];
u16 lname_t[LANG_COUNT];
u8 lname_w[LANG_COUNT], lname_x[LANG_COUNT];
u16 key_t[6];
u8 key_x, key_w;
u16 hint_t;
u8 hint_w, hint_x, hint_on;

void place_cursor(void)
{
    u8 x, y;
    if (!cur_on)
    {
        oamMemory[1] = 240;
        return;
    }
    if (screen == SCR_TITLE)
    {
        x = title_x[sel] - 12;
        y = ((T_MENU_ROW + (sel << 1)) << 3) + 3;
    }
    else
    {
        x = opt_cx[opt_sel];
        y = (opt_row[opt_sel] << 3) + 3;
    }
    oamMemory[0] = x;
    oamMemory[1] = y;
    oamMemory[2] = 0;
    oamMemory[3] = 0x30;
}

void mframe(void)
{
    u16 d;
    place_cursor();
    spcProcess();
    WaitForVBlank();
    if (fade_b != 255)
    {
        setBrightness(fade_b);
        fade_b = 255;
    }
    wipe_regs();
    REG_CGWSEL = wipe_wsel;
    // linhas do mapa que mudaram: um envio so, da primeira a ultima (varios envios pequenos em C passavam do
    // vblank e as ultimas linhas se perdiam: a letra do arremesso nao atualizava)
    if (dirty_hi)
    {
        dmaCopyVram((u8 *)&m3[dirty_lo << 5], MV_BG3_MAP + (dirty_lo << 5), (dirty_hi - dirty_lo) << 6);
        dirty_lo = 32;
        dirty_hi = 0;
    }
    pad = padsCurrent(0);
    pad_down = pad & ~pad_last;
    pad_last = pad;
    d = pad & (KEY_UP | KEY_DOWN | KEY_LEFT | KEY_RIGHT);
    nav = pad_down & d;
    if (!d)
        rep_t = 0;
    else if (nav)
        rep_t = REP_FIRST;
    else if (rep_t)
    {
        rep_t--;
        if (!rep_t)
        {
            nav = d;
            rep_t = REP_NEXT;
        }
    }
}

void menu_gfx_init(void)
{
    setScreenOff();
    setMode(BG_MODE1, 0x08);
    bgSetGfxPtr(0, MV_BG1_GFX);
    bgSetGfxPtr(2, MV_BG3_GFX);
    bgSetMapPtr(0, MV_BG1_MAP, SC_32x32);
    bgSetMapPtr(2, MV_BG3_MAP, SC_32x32);
    bgSetScroll(0, 0, 0);
    bgSetScroll(2, 0, 0);
    vram_clear(MV_BG3_GFX, 0x2000);
    vram_clear(MV_BG1_MAP, 1024);
    vram_low(&ui_txt_gfx, MV_BG3_GFX, (&ui_txt_end - &ui_txt_gfx));
    dmaCopyVram(&logo_gfx, MV_BG1_GFX, (&logo_end - &logo_gfx));
    oamInitGfxAttr(MV_OBJ_GFX, OBJ_SIZE8_L16);
    dmaCopyVram(&mcursor_gfx, MV_OBJ_GFX, 32);
    oam_hide_all();
    set_color(0, 0);
    set_color(1, 0x7FFF);
    set_color(5, 0x2D6B);
    set_color(9, 0x33E0);
    set_color(13, 0x1B5F);
    set_color(17, 0x56B5);
    dmaCopyCGram(&logo_pal, 32, 32);
    set_color(129, 0x1B5F);
    REG_TM = 0x15;
    REG_TS = 0;
    REG_CGADSUB = 0;
    REG_CGWSEL = wipe_wsel;
}

void draw_volume(u8 i)
{
    u8 c, v, row = opt_row[i];
    u16 t;
    v = bgm_lv;
    if (i)
        v = sfx_lv;
    ui2(OPT_BAR_X, row, UI_BAR_L, P_WHITE);
    for (c = 0; c < 10; c++)
    {
        t = UI_BAR_0;
        if (c < v)
            t = UI_BAR_8;
        ui2(OPT_BAR_X + 1 + c, row, t, P_WHITE);
    }
    ui2(OPT_BAR_X + 11, row, UI_BAR_R, P_WHITE);
    if (v == 10)
    {
        ui2(OPT_DIG_X, row, UI_DIG_1, P_YELLOW);
        ui2(OPT_DIG_X + 1, row, UI_DIG_0, P_YELLOW);
    }
    else
    {
        ui2(OPT_DIG_X, row, UI_BLANK, P_YELLOW);
        if (v)
            ui2(OPT_DIG_X + 1, row, UI_DIG_0 + (v << 1), P_YELLOW);
        else
            ui2(OPT_DIG_X + 1, row, UI_BLANK, P_YELLOW);
    }
    ui2(OPT_DIG_X + 2, row, UI_DIG_0, P_YELLOW);
}

void draw_lang(void)
{
    u8 row = opt_row[2];
    row_clear(row, OPT_ARROW_L + 1, OPT_ARROW_R);
    tiles_put(lname_t[pend_lang], row, lname_x[pend_lang], P_YELLOW, lname_w[pend_lang], 2);
}

void draw_keys(void)
{
    u8 a;
    for (a = 0; a < 5; a++)
        tiles_put(key_t[key_of[a]], opt_row[3 + a], key_x, P_YELLOW, key_w, 2);
}

void hint_update(void)
{
    u8 on = 0;
    if (opt_sel >= 3 && opt_sel < 8)
        on = 1;
    if (on == hint_on)
        return;
    hint_on = on;
    if (on)
        tiles_put(hint_t, OPT_HINT_ROW, hint_x, P_FOOT, hint_w, 2);
    else
        row_clear(OPT_HINT_ROW, 0, 32);
}

void build_title(void)
{
    u8 i, r, pal;
    u8 *lm = (u8 *)&logo_map_gfx;
    for (r = 0; r < LOGO_H; r++)
    {
        dmaCopyVram(lm, MV_BG1_MAP + ((T_LOGO_ROW + r) << 5) + ((32 - LOGO_W) >> 1), LOGO_W << 1);
        lm += LOGO_W << 1;
    }
    for (i = 0; i < 5; i++)
    {
        pal = P_WHITE;
        title_x[i] = txt_draw(txt_block(lang, TXT_ARCADE + i), T_MENU_ROW + (i << 1), pal, 255);
    }
    txt_draw(txc_block(TXC_FOOTER), T_FOOT_ROW, P_FOOT, 255);
    cur_on = 1;
}

void build_options(void)
{
    u8 i;
    txt_draw(txt_block(lang, TXT_OPTIONS), 1, P_WHITE, 255);
    for (i = 0; i < 8; i++)
    {
        txt_draw(txt_block(lang, TXT_BGM + i), opt_row[i], P_WHITE, OPT_LABEL_X);
        opt_cx[i] = (OPT_LABEL_X << 3) - 12;
    }
    opt_cx[8] = txt_draw(txt_block(lang, TXT_DEFAULT_KEYS), opt_row[8], P_WHITE, 255) - 12;
    opt_cx[9] = txt_draw(txt_block(lang, TXT_BACK), opt_row[9], P_WHITE, 255) - 12;
    for (i = 0; i < LANG_COUNT; i++)
    {
        lname_t[i] = line_load(txc_block(TXC_LANG0 + i), 0);
        lname_w[i] = ln_w;
        lname_x[i] = ln_xt;
    }
    for (i = 0; i < 6; i++)
        key_t[i] = line_load(txc_block(TXC_KEY_B + i), 0);
    key_x = ln_xt;
    key_w = ln_w;
    hint_t = line_load(txt_block(lang, TXT_REMAP_HINT), 0);
    hint_w = ln_w;
    hint_x = ln_xt;
    hint_on = 0;
    ui2(OPT_ARROW_L, opt_row[2], UI_ARROW_L, P_YELLOW);
    ui2(OPT_ARROW_R, opt_row[2], UI_ARROW_R, P_YELLOW);
    draw_volume(0);
    draw_volume(1);
    draw_lang();
    draw_keys();
    hint_update();
    cur_on = 1;
}

void build_screen(u8 s)
{
    u8 i;
    setScreenOff();
    memset(m3, 0, 2048);
    vram_clear(MV_BG1_MAP, 1024);
    next_tile = TXT_TILE0;
    cur_on = 0;
    screen = s;
    if (s == SCR_SPLASH)
        txt_draw(txc_block(TXC_SPLASH), 13, P_GREEN, 255);
    else if (s == SCR_TITLE)
        build_title();
    else if (s == SCR_CREDITS)
    {
        txt_draw(txt_block(lang, TXT_CREDITS), 3, P_WHITE, 255);
        txt_draw(txc_block(TXC_CREDITS_TEXT), 12, P_WHITE, 255);
    }
    else
        build_options();
    dmaCopyVram((u8 *)m3, MV_BG3_MAP, 2048);
    dirty_lo = 32;
    dirty_hi = 0;
    place_cursor();
    setBrightness(scr_bright);
}

void goto_screen(u8 s, u8 reverse)
{
    wipe_start(reverse);
    while (1)
    {
        mframe();
        if (wipe_update())
            break;
    }
    scr_bright = 15;
    build_screen(s);
    while (wipe_phase)
    {
        wipe_update();
        mframe();
    }
}

//---------------------------------------------------------------------------------
void menu_boot(void)
{
    lang = 0;
    bgm_lv = 10;
    sfx_lv = 10;
    keys_default();
    cfg_load();
    cfg_apply();
    wipe_phase = 0;
    wipe_wsel = 0;
    wipe_wh0 = 255;
    wipe_wh1 = 0;
    screen = SCR_SPLASH;
    splash_done = 0;
    scr_bright = 15;
    fade_b = 255;
    rep_t = 0;
    nav = 0;
    sel = 2;
    opt_sel = 0;
    menu_idle = 0;
    dirty_lo = 32;
    dirty_hi = 0;
}

// splash: fade in 1 s, parado 1,5 s, fade out 1 s (START, B ou A pulam)
void run_splash(void)
{
    u8 t, b = 0;
    scr_bright = 0;
    build_screen(SCR_SPLASH);
    pad_last = padsCurrent(0);
    t = 0;
    while (t < 60)
    {
        t++;
        b = t >> 2;
        fade_b = b;
        mframe();
        if (pad_down & (KEY_START | KEY_B | KEY_A))
            break;
    }
    if (t == 60)
        for (t = 0; t < 90; t++)
        {
            mframe();
            if (pad_down & (KEY_START | KEY_B | KEY_A))
                break;
        }
    t = b << 2;
    while (t)
    {
        t--;
        fade_b = t >> 2;
        mframe();
    }
}

void options_exit(void)
{
    lang = pend_lang;
    cfg_save();
    play_sfx(SFX_MOVE);
    goto_screen(SCR_TITLE, 1);
}

void options_input(void)
{
    u8 v, k, a, b, old;
    if (nav & KEY_UP)
    {
        if (opt_sel)
            opt_sel--;
        else
            opt_sel = OPT_N - 1;
        play_sfx(SFX_MOVE);
        hint_update();
        return;
    }
    if (nav & KEY_DOWN)
    {
        opt_sel++;
        if (opt_sel >= OPT_N)
            opt_sel = 0;
        play_sfx(SFX_MOVE);
        hint_update();
        return;
    }
    if (pad_down & KEY_START)
    {
        options_exit();
        return;
    }
    if (opt_sel < 2)
    {
        if (nav & (KEY_LEFT | KEY_RIGHT))
        {
            v = bgm_lv;
            if (opt_sel)
                v = sfx_lv;
            old = v;
            if (nav & KEY_LEFT)
            {
                if (v)
                    v--;
            }
            else if (v < 10)
                v++;
            if (v != old)
            {
                if (opt_sel)
                    sfx_lv = v;
                else
                    bgm_lv = v;
                cfg_apply();
                draw_volume(opt_sel);
                if (opt_sel)
                    play_sfx(SFX_JAB);
                else
                    play_sfx(SFX_MOVE);
            }
        }
        else if (pad_down & KEY_A)
            options_exit();
    }
    else if (opt_sel == 2)
    {
        if (nav & KEY_LEFT)
        {
            if (pend_lang)
                pend_lang--;
            else
                pend_lang = LANG_COUNT - 1;
            draw_lang();
            play_sfx(SFX_MOVE);
        }
        else if (nav & KEY_RIGHT)
        {
            pend_lang++;
            if (pend_lang >= LANG_COUNT)
                pend_lang = 0;
            draw_lang();
            play_sfx(SFX_MOVE);
        }
        else if (pad_down & KEY_A)
            options_exit();
    }
    else if (opt_sel < 8)
    {
        for (k = 0; k < 6; k++)
            if (pad_down & phys_key[k])
                break;
        if (k < 6)
        {
            a = opt_sel - 3;
            old = key_of[a];
            for (b = 0; b < 5; b++)
                if (key_of[b] == k)
                    key_of[b] = old;
            key_of[a] = k;
            cfg_apply();
            draw_keys();
            play_sfx(SFX_OK);
        }
    }
    else if (opt_sel == 8)
    {
        if (pad_down & KEY_B)
        {
            keys_default();
            cfg_apply();
            draw_keys();
            play_sfx(SFX_OK);
        }
        else if (pad_down & KEY_A)
            options_exit();
    }
    else if (pad_down & (KEY_B | KEY_A))
        options_exit();
}

u8 title_input(void)
{
    u8 t;
    if (nav & KEY_UP)
    {
        if (sel)
            sel--;
        else
            sel = 4;
        play_sfx(SFX_MOVE);
    }
    else if (nav & KEY_DOWN)
    {
        sel++;
        if (sel > 4)
            sel = 0;
        play_sfx(SFX_MOVE);
    }
    else if (pad_down & (KEY_B | KEY_START))
    {
        play_sfx(SFX_OK);
        for (t = 0; t < 24; t++)
        {
            cur_on = ((t >> 2) & 1) ^ 1;
            mframe();
        }
        cur_on = 1;
        if (sel <= 2)
        {
            // modo da partida (MODE_* em src/fight.c): Arcade = 1, Versus = 2, Practice = 0
            if (sel == 1)
                game_mode = 2;
            else if (sel == 0)
                game_mode = 1;
            else
                game_mode = 0;
            wipe_start(0);
            while (1)
            {
                mframe();
                if (wipe_update())
                    break;
            }
            oam_hide_all();
            return 1;
        }
        if (sel == 3)
            goto_screen(SCR_CREDITS, 0);
        else
        {
            pend_lang = lang;
            opt_sel = 0;
            goto_screen(SCR_OPTIONS, 0);
        }
    }
    return 0;
}

void menu_run(void)
{
    u8 t;
    game_screen = 0;
    sfx_set_menu();
    menu_gfx_init();
    if (!splash_done || menu_fade)
    {
        if (!splash_done)
            run_splash();
        splash_done = 1;
        menu_fade = 0;
        wipe_phase = 0;
        wipe_wsel = 0;
        scr_bright = 0;
        build_screen(SCR_TITLE);
        for (t = 1; t <= 30; t++)
        {
            fade_b = t >> 1;
            mframe();
        }
    }
    else
    {
        scr_bright = 15;
        build_screen(SCR_TITLE);
        while (wipe_phase)
        {
            wipe_update();
            mframe();
        }
    }
    scr_bright = 15;
    while (1)
    {
        menu_idle = 1;
        mframe();
        menu_idle = 0;
        if (screen == SCR_TITLE)
        {
            if (title_input())
                return;
        }
        else if (screen == SCR_CREDITS)
        {
            if (pad_down & (KEY_A | KEY_B | KEY_START))
            {
                play_sfx(SFX_MOVE);
                goto_screen(SCR_TITLE, 1);
            }
        }
        else
            options_input();
    }
}

//---------------------------------------------------------------------------------
// Telas do jogo de luta (src/fight.c): texto simples no BG3
u16 fx_text(u8 *blk, u8 row, u8 pal, u16 t, u16 *map, u16 gfx)
{
    u8 n, i, w, h, xt, r, c;
    u16 tiles, k, a;
    u8 *hdr = blk + 1;
    u8 *data;
    n = blk[0];
    data = blk + 1 + (n << 2);
    for (i = 0; i < n; i++)
    {
        w = hdr[i << 2];
        h = hdr[(i << 2) + 1];
        xt = hdr[(i << 2) + 2];
        tiles = w * h;
        vram_low(data, gfx + (t << 3), tiles << 3);
        data += tiles << 3;
        a = t | (pal << 10) | PRIO;
        for (r = 0; r < h; r++)
        {
            k = ((row + r) << 5) + xt;
            for (c = 0; c < w; c++)
                map[k++] = a++;
        }
        t += tiles;
        row += h;
    }
    return t;
}

u8 *fx_block_select(void)
{
    return txt_block(lang, TXT_SELECT);
}

u8 *fx_block_back(void)
{
    return txt_block(lang, TXT_BACK_HINT);
}

u8 *fx_block_ending(void)
{
    return txt_block(lang, TXT_ENDING);
}

u8 *fx_block_vs(void)
{
    return txc_block(TXC_VS);
}
