ifeq ($(strip $(PVSNESLIB_HOME)),)
$(error "Defina PVSNESLIB_HOME (veja https://github.com/alekmaul/pvsneslib/wiki/Installation)")
endif

export ROMNAME := fight
export ROMTITLE := STREET COMBAT
# SRAM de 2 KB com bateria: as Opcoes ficam salvas (src/menu.c)
export CARTRIDGETYPE := 02
export SRAMSIZE := 01
# 1 MB (textos dos 9 idiomas + sprites do Ryu)
# 2 MB: o jogo ocupa os bancos 0-15 e o PACK de dados (tools/sfpack.py) os bancos 16-63 (arquivo 0x80000)
export ROMSIZE := 0B
export ROMBANKS := 64
# FastROM: o codigo e as tabelas na ROM rodam a 3,58 MHz (SlowROM = 2,68 MHz): ~33% mais rapido em tudo
export FASTROM := 1

# efeitos sonoros (SNESMOD): o primeiro .it da lista tem que ser o dos efeitos. audio/sfx.it vem dos exemplos da
# PVSnesLib (efeito 4 = cowbell, usado como som de defesa)
AUDIOFILES := audio/sfx.it audio/empty.it
export SOUNDBANK := res/soundbank

include ${PVSNESLIB_HOME}/devkitsnes/snes_rules

.PHONY: all assets

# converte sprites/*.png, stage.png e idiomas/textos.tsv para os binarios em res/
assets:
	python3 tools/mkassets.py
	python3 tools/mkfight.py
	python3 tools/sfpack.py ../project/game.json res/frames.json res/pack.bin res/pack.asm

SMCONVFLAGS := -s -o $(SOUNDBANK) -V -b 5
musics: $(SOUNDBANK).obj

# banco de sons maior que 32 KB: o smconv divide em 2 bancos de ROM, mas o 2o pedaco tem que comecar em $8000 do
# banco seguinte (o SNESMOD continua a leitura ali). tools/fixbank.py fixa as secoes no inicio de cada banco
$(SOUNDBANK).asm : $(AUDIOFILES)
	@echo Compiling Soundbank ...
	$(SMCONV) $(SMCONVFLAGS) $^
	python3 tools/fixbank.py $(SOUNDBANK).asm

# C -> asm: depois do otimizador, prende as secoes de RAM nos bancos $7E/$7F (tools/fixram.py, por causa do FastROM)
%.asm: %.ps
	@echo Assembling ... $(notdir $<)
	$(OPT) -i $< -o $@
	python3 tools/fixram.py $@

# dependencias que as regras da PVSnesLib nao enxergam: os .bin/.pal incluidos pelo data.asm (res/fight.asm), as
# tabelas geradas (res/ryu.h, res/fight.h) e a tabela de blocos do src/drawobj.asm. Sem isso, depois de regerar os
# graficos o make juntava tabelas novas com graficos velhos (quadros embaralhados)
data.obj: $(wildcard res/*.bin res/*.pal) res/fight.asm
src/fight.ps: res/ryu.h res/fight.h res/soundbank.h src/sfx.h
src/menu.ps: res/menu.h src/sfx.h
src/drawobj.obj: res/chunks.inc

all: assets musics $(ROMNAME).sfc

clean: cleanBuildRes cleanRom cleanGfx cleanAudio
