# Análise de Resultados - Olimpíadas

## Resumo do projeto

Nosso projeto consiste em uma plataforma interativa de análise para explorar dados históricos dos Jogos Olímpicos por meio de três visualizações complementares: (1) a evolução temporal do desempenho em provas de atletismo, (2) uma visualização dinâmica em rede das relações de competição entre atletas, e (3) um ranking animado das conquistas de medalhas por nação ao longo das edições olímpicas. Nosso sistema permite que entusiastas do esporte, analistas e historiadores identifiquem tendências de desempenho, examinem padrões de domínio e compreendam a evolução das Olimpíadas por meio de interfaces visuais intuitivas.

Dataset: [Olympic Results (1986-2018)](https://www.kaggle.com/datasets/piterfm/olympic-games-medals-19862018?select=olympic_results.csv)

## Processo de pesquisa/desenvolvimento

Este projeto é uma expansão do trabalho iniciado na Tarefa 4. Decidimos continuar com a mesma base de dados olímpicos para aproveitar todo o seu potencial e transformar a análise inicial em uma plataforma mais completa.

A primeira visualização, de resultados ao longo do tempo, já existia e foi aprimorada. Melhoramos a interatividade, permitindo que o usuário clique em uma linha para focar em um evento específico, e melhoramos todo o seu visual. As outras duas páginas, "Atletas" e "Edições", foram criadas do zero nesta nova fase.

Para a página "Atletas", nossa primeira ideia foi um gráfico de linha do tempo, comparando dois atletas. Após recebermos feedbacks, percebemos que essa não era a melhor abordagem, já que a maioria dos atletas compete em poucas Olimpíadas, o que deixava o gráfico com apenas dois ou três pontos. Por isso, mudamos para uma rede de rivalidades. Com ela, fica muito mais fácil ver todos os adversários de um atleta e comparar seus resultados ao passar o mouse sobre eles.

Já a página "Edições" traz uma animação com os 10 países com mais medalhas acumuladas. Para inovar em um formato de visualização já conhecido, adicionamos cards dinâmicos ao lado do gráfico, que trazem informações e curiosidades sobre cada edição específica, como os atletas de destaque e o desempenho do Brasil. 

## Divisão do trabalho:

Durante o trabalho todos tiveram participação nas discussões e decisões de projeto. A divisão a seguir não foi seguida a risca, todos  tiveram contribuições em todas as partes do projeto.

Guilherme Carvalho:
  - Cards animados do gráfico de ranking
  - Estilização do gráfico da home
  - CSS geral

Guilherme Buss:
  - Gráfico da Rede de atletas
  - Trailer de apresentação
    
Luís Felipe Marciano:
  - Gráfico do raking de países animado
  - Paper final e README
  - Textos motivadores
