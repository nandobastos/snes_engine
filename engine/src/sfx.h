// efeitos de som (audio/sfx.it, gerado por tools/mksfx.py dos WAVs de audio/wav; o numero = ordem em mksfx.SFX)
// usado por src/fight.c e src/menu.c
enum { SFX_LIGHT, SFX_MEDIUM, SFX_HARD1, SFX_HARD2, SFX_JAB, SFX_STRONG, SFX_FIERCE, SFX_SHORT, SFX_FORWARD,
       SFX_ROUNDHOUSE, SFX_BLOCKED, SFX_GROUND, SFX_LANDING, SFX_HADOUKEN, SFX_SHORYU, SFX_TATSU, SFX_MOVE, SFX_OK, SFX_TIGER, SFX_TIGERUP,
       SFX_V_ROUND, SFX_V_ONE, SFX_V_TWO, SFX_V_THREE, SFX_V_FIGHT, SFX_V_WIN, SFX_V_LOSE, SFX_KO,
       SFX_V_C9, SFX_V_C8, SFX_V_C7, SFX_V_C6, SFX_V_C5, SFX_V_C4, SFX_V_C3, SFX_V_C2, SFX_V_C1, SFX_V_PERFECT, SFX_PAUSE, SFX_COUNT };
void play_sfx(u8 id);
