import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../models/ludo_room.dart';

class GameScreen extends StatefulWidget {
  const GameScreen({super.key});

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  final TextEditingController _chatController = TextEditingController();
  int? _selectedTokenIndex;

  void _showChatSheet(LudoRoomController room) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom,
            left: 16,
            right: 16,
            top: 16,
          ),
          child: SizedBox(
            height: 420,
            child: Column(
              children: [
                const Text(
                  'Room chat',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: ListView.builder(
                    reverse: true,
                    itemCount: room.chatMessages.length,
                    itemBuilder: (context, index) {
                      final message = room
                          .chatMessages[room.chatMessages.length - 1 - index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Align(
                          alignment: room.isCurrentUser(message.playerId)
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: Container(
                            constraints: const BoxConstraints(maxWidth: 280),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              color: room.isCurrentUser(message.playerId)
                                  ? const Color(0xFF6D5EF6)
                                  : const Color(0xFFF3F4F6),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  message.playerName,
                                  style: TextStyle(
                                    color: room.isCurrentUser(message.playerId)
                                        ? Colors.white
                                        : Colors.black87,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  message.message,
                                  style: TextStyle(
                                    color: room.isCurrentUser(message.playerId)
                                        ? Colors.white
                                        : Colors.black87,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _chatController,
                        maxLength: 280,
                        maxLines: 3,
                        minLines: 1,
                        decoration: InputDecoration(
                          hintText: 'Type a message...',
                          filled: true,
                          fillColor: const Color(0xFFF5F7FF),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      onPressed: room.isConnected
                          ? () {
                              room.sendChatMessage(_chatController.text);
                              _chatController.clear();
                            }
                          : null,
                      icon: const Icon(
                        Icons.send_rounded,
                        color: Color(0xFF6D5EF6),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final room = context.watch<LudoRoomController>();
    final players = room.players;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          room.roomCode.isEmpty ? 'Game Lobby' : 'Room ${room.roomCode}',
        ),
        backgroundColor: const Color(0xFF6D5EF6),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            onPressed: () => _showChatSheet(room),
            icon: const Icon(Icons.chat_bubble_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              if (room.lastError != null || !room.isConnected)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(10),
                  color: room.lastError != null
                      ? const Color(0xFFFEE2E2)
                      : const Color(0xFFFEF3C7),
                  child: Text(room.lastError ?? room.connectionStatus),
                ),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Current turn: ${room.currentPlayerName}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      'Dice: ${room.diceValue == 0 ? '-' : room.diceValue}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  for (final player in players)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            vertical: 10,
                            horizontal: 8,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: player.color, width: 2),
                          ),
                          child: Column(
                            children: [
                              CircleAvatar(
                                radius: 14,
                                backgroundColor: player.color,
                                child: Text(
                                  player.name.substring(0, 1),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                player.name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                              Text(
                                player.isConnected
                                    ? (player.isReady ? 'Ready' : 'Waiting')
                                    : 'Offline',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: player.isConnected && player.isReady
                                      ? Colors.green
                                      : Colors.grey,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              Expanded(
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(28),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.08),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: LudoBoard(
                    gamePlayers: room.gamePlayers,
                    currentTurnIndex: room.currentTurnIndex,
                    legalTokenIndices: room.isMyTurn
                        ? room.legalMoves
                        : const [],
                    selectedTokenIndex: _selectedTokenIndex,
                    onTokenSelected: (tokenIndex) =>
                        setState(() => _selectedTokenIndex = tokenIndex),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              if (room.gameFinished)
                Text(
                  'Winner: ${room.winnerName}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                )
              else if (!room.gameStarted)
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: room.isHost && players.length >= 2
                        ? room.startGame
                        : null,
                    icon: const Icon(Icons.flag_rounded),
                    label: Text(
                      room.isHost ? 'Start game' : 'Waiting for host',
                    ),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      backgroundColor: const Color(0xFF22C55E),
                      foregroundColor: Colors.white,
                    ),
                  ),
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed:
                            room.isConnected &&
                                room.isMyTurn &&
                                room.legalMoves.isEmpty
                            ? () => room.rollDice()
                            : null,
                        icon: const Icon(Icons.casino_rounded),
                        label: const Text('Roll Dice'),
                        style: ElevatedButton.styleFrom(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          backgroundColor: const Color(0xFF3B82F6),
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed:
                            room.isConnected &&
                                room.isMyTurn &&
                                _selectedTokenIndex != null &&
                                room.legalMoves.contains(_selectedTokenIndex)
                            ? () {
                                room.moveToken(_selectedTokenIndex!);
                                setState(() => _selectedTokenIndex = null);
                              }
                            : null,
                        icon: const Icon(Icons.play_arrow_rounded),
                        label: const Text('Move'),
                        style: ElevatedButton.styleFrom(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          backgroundColor: const Color(0xFF22C55E),
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _chatController.dispose();
    super.dispose();
  }
}

class LudoBoard extends StatelessWidget {
  const LudoBoard({
    super.key,
    required this.gamePlayers,
    required this.currentTurnIndex,
    this.legalTokenIndices = const [],
    this.selectedTokenIndex,
    this.onTokenSelected,
  });

  final List<dynamic> gamePlayers;
  final int currentTurnIndex;
  final List<int> legalTokenIndices;
  final int? selectedTokenIndex;
  final ValueChanged<int>? onTokenSelected;

  static const int boardSize = 15;

  Color _cellColor(int row, int col) {
    final homeGreen =
        (row < 6 && col < 6) || (row == 6 && col < 6) || (row < 6 && col == 6);
    final homeYellow =
        (row < 6 && col > 8) || (row == 6 && col > 8) || (row < 6 && col == 8);
    final homeBlue =
        (row > 8 && col > 8) || (row == 8 && col > 8) || (row > 8 && col == 8);
    final homeRed =
        (row > 8 && col < 6) || (row == 8 && col < 6) || (row > 8 && col == 6);

    if (homeGreen) return const Color(0xFFB7F7C9);
    if (homeYellow) return const Color(0xFFFDE68A);
    if (homeBlue) return const Color(0xFFBFDBFE);
    if (homeRed) return const Color(0xFFFECACA);

    if (row == 7 && col >= 1 && col <= 6) return const Color(0xFFB7F7C9);
    if (col == 7 && row >= 1 && row <= 6) return const Color(0xFFFDE68A);
    if (row == 7 && col >= 8 && col <= 13) return const Color(0xFFBFDBFE);
    if (col == 7 && row >= 8 && row <= 13) return const Color(0xFFFECACA);

    if ((row == 6 || row == 8) && (col >= 5 && col <= 9)) {
      return const Color(0xFFF3F4F6);
    }
    if ((col == 6 || col == 8) && (row >= 5 && row <= 9)) {
      return const Color(0xFFF3F4F6);
    }
    if (row == 7 && col == 7) return const Color(0xFF94A3B8);
    return const Color(0xFFE5E7EB);
  }

  List<Map<String, int>> _homeCells(Color color) {
    if (color == const Color(0xFF2ECC71)) {
      return [
        {'row': 1, 'col': 1},
        {'row': 1, 'col': 4},
        {'row': 4, 'col': 1},
        {'row': 4, 'col': 4},
      ];
    }
    if (color == const Color(0xFFFBBF24)) {
      return [
        {'row': 1, 'col': 10},
        {'row': 1, 'col': 13},
        {'row': 4, 'col': 10},
        {'row': 4, 'col': 13},
      ];
    }
    if (color == const Color(0xFF3B82F6)) {
      return [
        {'row': 10, 'col': 10},
        {'row': 10, 'col': 13},
        {'row': 13, 'col': 10},
        {'row': 13, 'col': 13},
      ];
    }
    return [
      {'row': 10, 'col': 1},
      {'row': 10, 'col': 4},
      {'row': 13, 'col': 1},
      {'row': 13, 'col': 4},
    ];
  }

  @override
  Widget build(BuildContext context) {
    final tokenLayout = <Map<String, dynamic>>[];
    for (var i = 0; i < gamePlayers.length; i++) {
      final player = gamePlayers[i];
      for (
        var tokenIndex = 0;
        tokenIndex < player.tokens.length;
        tokenIndex++
      ) {
        final token = player.tokens[tokenIndex];
        int row;
        int col;
        if (token.position < 0) {
          final homeCell = _homeCells(player.color)[tokenIndex % 4];
          row = homeCell['row']!;
          col = homeCell['col']!;
        } else {
          if (token.row == null || token.col == null) continue;
          row = token.row!;
          col = token.col!;
        }

        tokenLayout.add({
          'color': player.color,
          'row': row,
          'col': col,
          'tokenIndex': tokenIndex,
          'canSelect':
              i == currentTurnIndex && legalTokenIndices.contains(tokenIndex),
          'selected': i == currentTurnIndex && selectedTokenIndex == tokenIndex,
        });
      }
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final cellSize = constraints.maxWidth / boardSize;

        return Stack(
          children: [
            GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: boardSize,
                childAspectRatio: 1,
              ),
              itemCount: boardSize * boardSize,
              itemBuilder: (context, index) {
                final row = index ~/ boardSize;
                final col = index % boardSize;
                return Container(
                  margin: const EdgeInsets.all(0.5),
                  color: _cellColor(row, col),
                );
              },
            ),
            for (final token in tokenLayout)
              Positioned(
                left: ((token['col'] as int) * cellSize) + (cellSize * 0.14),
                top: ((token['row'] as int) * cellSize) + (cellSize * 0.14),
                child: GestureDetector(
                  onTap: token['canSelect'] == true
                      ? () => onTokenSelected?.call(token['tokenIndex'] as int)
                      : null,
                  child: Semantics(
                    button: token['canSelect'] == true,
                    selected: token['selected'] == true,
                    label: 'Token ${(token['tokenIndex'] as int) + 1}',
                    child: Container(
                      width: cellSize * 0.72,
                      height: cellSize * 0.72,
                      decoration: BoxDecoration(
                        color: token['color'] as Color,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: token['selected'] == true
                              ? Colors.black
                              : token['canSelect'] == true
                              ? Colors.green.shade900
                              : Colors.white,
                          width:
                              token['selected'] == true ||
                                  token['canSelect'] == true
                              ? 3
                              : 2,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: (token['color'] as Color).withValues(
                              alpha: 0.38,
                            ),
                            blurRadius: 5,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
