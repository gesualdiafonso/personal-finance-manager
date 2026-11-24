# NavMobile

Navegação do iPhone: a tab Obrigações abre diretamente uma das três áreas (aqui, Cartões, em `/cartoes`), e "Mais" lista as nove áreas.

- A tab Obrigações nunca mostra um ecrã intermédio: abre a última área usada. O título é o nome da área.
- O controlo segmentado troca entre Contas domésticas, Cartões e Recorrências; cada segmento muda a rota.
- Pressão longa na tab mostra as três áreas.
- "Mais" é uma bottom sheet com as nove áreas agrupadas como na sidebar desktop; a área atual aparece em `forest`; contadores só quando pedem ação.
- A bottom sheet cobre a tab bar, como as outras sheets do iPhone.
