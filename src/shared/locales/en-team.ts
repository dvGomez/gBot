/** Strings of the bot, specialization and routine pages (Portuguese source → English). */
export const enTeam: Record<string, string> = {
  // Especializações
  'Exemplo:\nVocê revisa contratos de prestação de serviço.\n- Leia o contrato e liste as cláusulas de risco.\n- Para cada risco, explique em linguagem simples e sugira uma redação alternativa.\n- Seja objetivo e use tópicos.':
    'Example:\nYou review service contracts.\n- Read the contract and list the risky clauses.\n- For each risk, explain it in plain language and suggest alternative wording.\n- Be concise and use bullet points.',
  'Dê um nome à especialização.': 'Give the specialization a name.',
  'Escreva o que a especialização ensina a fazer.': 'Describe what the specialization teaches.',
  'Nova especialização': 'New specialization', ' Nova especialização': ' New specialization',
  'Um conhecimento que os bots usam: o passo a passo, os cuidados e o formato da resposta. Os bots que a recebem seguem isso.':
    'Knowledge your bots use: the steps, the precautions and the answer format. Bots that have it follow it.',
  'Nome da especialização (ex.: Consultar pull requests)': 'Specialization name (e.g. Review pull requests)',
  'Nome da especialização': 'Specialization name',
  'Descrição: o que ela ensina (ex.: Revisa contratos e aponta cláusulas de risco)': 'Description: what it teaches (e.g. Reviews contracts and flags risky clauses)',
  'Descrição da especialização': 'Specialization description',
  'O passo a passo, os cuidados e o formato da resposta. Vale para todo bot que usar esta especialização.':
    'The steps, precautions and answer format. Applies to every bot that uses this specialization.',
  'Especializações soltas podem ser usadas em qualquer lugar; as de um projeto, só nele.':
    'Standalone specializations can be used anywhere; project ones only inside that project.',
  'Nenhum (especialização solta)': 'None (standalone specialization)',
  'Excluir a especialização? Os bots que a usam deixam de usá-la.': 'Delete the specialization? Bots that use it will stop using it.',
  ' Excluir especialização': ' Delete specialization', 'Excluir especialização': 'Delete specialization',
  'Excluir esta especialização? Os bots que a usam deixam de usá-la.': 'Delete this specialization? Bots that use it will stop using it.',
  'Criar especialização': 'Create specialization', 'Bots que usam': 'Bots using it',
  'Nenhum bot usa esta especialização ainda. Adicione na página de um bot, em Editar.': 'No bot uses this specialization yet. Add it from a bot page, under Edit.',
  'Especializações do projeto': 'Project specializations', 'Criar especialização no projeto': 'Create specialization in project',
  'Nota (opcional): do que se trata, quando usar': 'Note (optional): what it is and when to use it',
  ' · lidos quando o pedido precisar': ' · read when a request needs them',
  'Os bots que usam esta especialização veem a lista e abrem o conteúdo só quando o pedido precisar.':
    'Bots using this specialization see the list and open files only when a request needs them.',
  ' Os bots não abrem este formato: exporte como PDF ou CSV.': ' Bots cannot open this format: export it as PDF or CSV.',

  // Chat
  'Usar uma especialização nesta mensagem': 'Use a specialization in this message',
  '@ chama um bot · / usa uma especialização': '@ calls a bot · / uses a specialization',
  'Este bot usa as especializações e a personalidade que você definiu.': 'This bot uses the specializations and personality you set.',
  'Pergunte o que quiser. Mencione um bot com @ ou use uma especialização com /.': 'Ask anything. Mention a bot with @ or use a specialization with /.',

  // Bots
  'Exemplo:\nVocê é calma e caprichosa. Fala de um jeito simples e direto.\n- Antes de enviar algo a clientes, peça minha confirmação.\n- Prefira respostas curtas, em tópicos.':
    'Example:\nYou are calm and careful. You speak simply and directly.\n- Ask for my confirmation before sending anything to clients.\n- Prefer short answers in bullet points.',
  'Um membro do time: tem avatar, personalidade e especializações, conversa com você e roda rotinas sozinho.':
    'A team member: it has an avatar, a personality and specializations, chats with you and runs routines on its own.',
  'Descrição: do que este bot cuida (ex.: Cuida dos contratos e dos pagamentos da empresa)': 'Description: what this bot takes care of (e.g. Handles the company contracts and payments)',
  'O que o bot sabe fazer. As instruções de cada uma vão para ele em todas as conversas e rotinas.':
    'What the bot knows how to do. Each one’s instructions go with it in every chat and routine.',
  'Você ainda não tem especializações. ': 'You have no specializations yet. ', 'Criar uma especialização': 'Create a specialization',
  'Personalidade e orientações (opcional)': 'Personality and guidance (optional)', 'Personalidade e orientações': 'Personality and guidance',
  'Tom, prioridades e o que evitar. Vale em tudo o que o bot faz, junto com as especializações.':
    'Tone, priorities and what to avoid. Applies to everything the bot does, along with its specializations.',
  'Bots soltos podem ser chamados em qualquer conversa; os de um projeto, só nele. As rotinas usam a pasta do projeto.':
    'Standalone bots can be called in any chat; project bots only inside that project. Routines use the project folder.',
  'Usado nas conversas e rotinas. Dá para trocar em cada conversa ou etapa.': 'Used in chats and routines. You can change it per chat or step.',
  'Excluir o bot com as rotinas e as conversas dele?': 'Delete the bot with its routines and chats?',
  'Excluir este bot com as rotinas e as conversas dele? Não dá para desfazer.': 'Delete this bot with its routines and chats? This cannot be undone.',
  'Excluir {0} com as rotinas e as conversas dele? Não dá para desfazer.': 'Delete {0} with its routines and chats? This cannot be undone.',
  'Escolher': 'Choose',
  'Nenhuma especialização. Em Editar, escolha o que este bot sabe fazer.': 'No specializations. Under Edit, choose what this bot knows how to do.',
  '{0} rotinas · {1} ligadas': '{0} routines · {1} on',

  // Rotinas
  'Nova rotina': 'New routine', ' Nova rotina': ' New routine', 'Rotinas de ': 'Routines of ', 'Rotina ligada': 'Routine on',
  'Ainda não rodou': 'Has not run yet', 'Rodando agora': 'Running now', 'Falhou {0}': 'Failed {0}', 'Parada {0}': 'Stopped {0}', 'Rodou {0}': 'Ran {0}',
  'Nenhuma rotina ainda. Crie uma para o bot trabalhar sozinho, num horário ou de tempos em tempos.':
    'No routines yet. Create one so the bot works on its own, at set times or every so often.',
  'Rotina sem nome': 'Untitled routine', 'Rotina de {0}': 'Routine of {0}', 'Nome da rotina': 'Routine name',
  'Excluir rotina': 'Delete routine', 'Excluir esta rotina e o histórico dela? Não dá para desfazer.': 'Delete this routine and its run history? This cannot be undone.',
  'Rotina em execução · edição bloqueada até terminar ou parar.': 'Routine running · editing is locked until it finishes or stops.',
  'As etapas usam e preenchem a memória do bot. Lições sobre uma especialização ficam nela.':
    'Steps use and fill the bot’s memory. Lessons about a specialization are stored with it.',
  'Nenhum arquivo mexido pelas execuções desta rotina ainda.': 'No files accessed by this routine’s runs yet.',
  'Clique numa caixinha para configurar, ou adicione uma Tarefa, Decisão ou Confirmação.': 'Click a step to configure it, or add a Task, Decision or Confirmation.',
  'Conta a partir da última execução (ou de quando a rotina foi ligada).': 'Counted from the last run (or when the routine was turned on).',
  'O que {0} usa nesta etapa. Sem especialização, faz com o que já sabe.': 'What {0} uses in this step. Without a specialization, it works with what it already knows.',
  'Nenhuma': 'None', 'Do bot': 'The bot’s', 'Outras': 'Others', 'O que fazer nesta etapa': 'What to do in this step',
  'Por padrão, o do bot. Escolha outro só para esta etapa se precisar.': 'The bot’s model by default. Pick another just for this step if needed.',
  'O modelo do bot': 'The bot’s model', 'Outro modelo nesta etapa': 'Another model for this step', 'Sem especialização': 'No specialization',
  'Escolha como a rotina deve seguir.': 'Choose how the routine should continue.',

  // Processo principal (bandeja, erros e ferramentas)
  'Nenhuma rotina ativa': 'No routines on', 'rotina ativa': 'routine on', 'rotinas ativas': 'routines on',
  'Esta rotina já está rodando.': 'This routine is already running.',
  'Esta rotina está rodando: pare a execução ou espere terminar para editar.': 'This routine is running: stop it or wait until it finishes to edit.',
  'Pare a rotina antes de excluir.': 'Stop the routine before deleting it.', 'Rotina não encontrada.': 'Routine not found.',
  'Pare as rotinas do bot antes de excluir.': 'Stop the bot’s routines before deleting it.',
  'Uma rotina que usa esta especialização está rodando: pare a rotina antes de excluir.': 'A routine using this specialization is running: stop it before deleting.',
  'O bot desta rotina não existe mais.': 'This routine’s bot no longer exists.',
  'A especialização desta caixinha não existe mais.': 'This step’s specialization no longer exists.',
  'A rotina não tem gatilho.': 'The routine has no trigger.',
  'A rotina tem um ciclo (uma caixinha volta para o gatilho).': 'The routine has a loop (a step leads back to the trigger).',
  'A rotina tem um ciclo entre caixinhas.': 'The routine has a loop between steps.',
  'Viu os bots, especializações e projetos do gBot': 'Checked gBot bots, specializations and projects',
  // Fluxo do bot (canvas na página do bot, um gatilho por rotina)
  'Nenhuma conversa ainda. Pergunte a {0} o que quiser, inclusive sobre o que as rotinas encontraram.':
    'No chats yet. Ask {0} anything, including what the routines found.',
  'Nenhum arquivo mexido pelas execuções das rotinas ainda.': 'No files accessed by routine runs yet.',
  'Clique numa caixinha para configurar, ou adicione um Gatilho, Tarefa, Decisão ou Confirmação.':
    'Click a step to configure it, or add a Trigger, Task, Decision or Confirmation.',
  'Só manual': 'Manual only', 'Esta rotina só roda quando você mandar (botão Rodar no gatilho).': 'This routine only runs when you start it (Run button on the trigger).',
  'Aparece no histórico e nas notificações.': 'Shown in the run history and notifications.',
  'Ligada: roda pela agenda': 'On: runs on schedule', 'Desligada: só roda quando você mandar': 'Off: only runs when you start it',
  ' Parar': ' Stop', 'Parar': 'Stop', 'Rodar': 'Run', 'Desligada': 'Off',
  'Escolher especializações': 'Choose specializations', 'Carregando o fluxo…': 'Loading the flow…',
  'Viu o histórico das rotinas': 'Checked the routine history', 'Viu os detalhes de uma execução': 'Checked a run’s details',
  'Este bot já tem um fluxo.': 'This bot already has a flow.',
  // Menções com @
  'Mencionar um bot': 'Mention a bot',
  'Use @ para envolver outro bot: o bot desta etapa pergunta a ele e segue de acordo com a resposta.':
    'Use @ to involve another bot: this step’s bot asks it and acts on the answer.',
  'Ex.: Pergunte ao @Fulano sobre o pedido de hoje e, se estiver atrasado, avise o cliente.':
    'E.g. Ask @Someone about today’s order and, if it is late, notify the customer.',
  'Tom, prioridades e o que evitar. Vale em tudo o que o bot faz, junto com as especializações. Use @ para citar outro bot.':
    'Tone, priorities and what to avoid. Applies to everything the bot does, along with its specializations. Use @ to mention another bot.',
  'O passo a passo, os cuidados e o formato da resposta. Vale para todo bot que usar esta especialização. Use @ para envolver outro bot.':
    'The steps, precautions and answer format. Applies to every bot that uses this specialization. Use @ to involve another bot.',
  // Chat flutuante da página do bot
  'Chat': 'Chat', 'Abrir em tela cheia': 'Open full screen', 'Fechar chat': 'Close chat',
  'Pergunte o que quiser, inclusive sobre o que as rotinas encontraram, ou peça mudanças no fluxo: {0} propõe e você aplica.':
    'Ask anything, including what the routines found, or ask for changes to the flow: {0} proposes and you apply.',
  // Cartão do plano: revisão e sugestões
  'Pontos de atenção': 'Things to watch', 'O que foi testado': 'What was tested',
  'Sugestões (fora do plano)': 'Suggestions (not in the plan)',
  'Quero também estas melhorias:': 'I also want these improvements:',
  'Inclua no plano estas sugestões:': 'Add these suggestions to the plan:',
  'Pedido enviado na conversa.': 'Request sent in the chat.',
  ' Pedir as melhorias ({0})': ' Request improvements ({0})', ' Incluir no plano ({0})': ' Add to plan ({0})',
  // Cartão de perguntas
  '{0} de {1}': '{0} of {1}', 'Próxima': 'Next', 'Sua resposta… (Shift+Enter quebra a linha)': 'Your answer… (Shift+Enter for a new line)'
}
