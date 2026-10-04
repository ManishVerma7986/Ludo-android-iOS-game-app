import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:material_ui/material_ui.dart';
import 'package:socket_io_client/socket_io_client.dart' as socket_io;

class LudoPlayer {
  final String id;
  final String name;
  final Color color;
  final bool isHost;
  final bool isReady;
  final bool isConnected;

  const LudoPlayer({
    required this.id,
    required this.name,
    required this.color,
    required this.isHost,
    required this.isReady,
    required this.isConnected,
  });
}

class ChatMessage {
  final String playerId;
  final String playerName;
  final String message;
  final DateTime createdAt;

  const ChatMessage({
    required this.playerId,
    required this.playerName,
    required this.message,
    required this.createdAt,
  });
}

class LudoTokenState {
  final int tokenIndex;
  int position;
  bool inHome;
  bool isSafe;
  int? row;
  int? col;

  LudoTokenState({
    required this.tokenIndex,
    this.position = -1,
    this.inHome = false,
    this.isSafe = false,
    this.row,
    this.col,
  });
}

class LudoGamePlayerState {
  final String playerId;
  final String name;
  final Color color;
  final List<LudoTokenState> tokens;

  const LudoGamePlayerState({
    required this.playerId,
    required this.name,
    required this.color,
    required this.tokens,
  });
}

class LudoRoomController extends ChangeNotifier {
  static const _sessionStorageKey = 'ludo.guest_session';

  String roomCode = '';
  bool isHost = false;
  bool gameStarted = false;
  bool gameFinished = false;
  int currentTurnIndex = 0;
  int diceValue = 0;
  String winnerId = '';
  String currentUserName = '';
  String _playerId = '';
  String? lastError;
  String connectionStatus = 'Connecting';
  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();
  Map<String, String>? _pendingRoomAction;
  bool _authRequestPending = false;
  bool _disposed = false;
  bool _recoveringExpiredSession = false;
  String? _sessionToken;
  Map? _lastRoomSnapshot;

  final List<LudoPlayer> players = [];
  final List<LudoGamePlayerState> gamePlayers = [];
  final List<ChatMessage> chatMessages = [];
  final List<int> legalMoves = [];
  socket_io.Socket? _socket;

  LudoRoomController({bool connectToServer = true}) {
    if (connectToServer) _connectSocket();
  }

  void _connectSocket() {
    unawaited(_initializeSocket());
  }

  Future<void> _initializeSocket() async {
    const configuredUrl = String.fromEnvironment('LUDO_SERVER_URL');
    final baseUrl = configuredUrl.isNotEmpty
        ? configuredUrl
        : (Platform.isAndroid
              ? 'http://10.0.2.2:4000'
              : 'http://localhost:4000');
    final uri = Uri.tryParse(baseUrl);
    if (uri == null ||
        !uri.hasAuthority ||
        (kReleaseMode && uri.scheme != 'https')) {
      connectionStatus =
          'Configure a valid HTTPS LUDO_SERVER_URL for release builds';
      return;
    }

    try {
      _sessionToken = await _secureStorage.read(key: _sessionStorageKey);
    } catch (_) {
      connectionStatus = 'Secure session storage is unavailable';
      lastError = connectionStatus;
      notifyListeners();
      return;
    }
    if (_disposed) return;

    _socket = socket_io.io(baseUrl, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
      'auth': _sessionToken == null
          ? <String, dynamic>{}
          : {'sessionToken': _sessionToken},
    });

    _socket!.onConnect((_) {
      connectionStatus = _sessionToken == null
          ? 'Connected'
          : 'Restoring session';
      lastError = null;
      notifyListeners();
      if (_sessionToken == null && _pendingRoomAction != null) {
        _requestGuestAuthentication();
      }
    });

    _socket!.onDisconnect((_) {
      connectionStatus = 'Disconnected';
      notifyListeners();
    });

    _socket!.onConnectError((data) {
      connectionStatus = 'Unable to reach the game server';
      lastError = connectionStatus;
      if (data.toString().contains('INVALID_SESSION')) {
        if (!_recoveringExpiredSession) unawaited(_recoverExpiredSession());
        connectionStatus = 'Session expired; create or join again';
        lastError = connectionStatus;
      }
      notifyListeners();
    });

    _socket!.on('app:error', (data) {
      final code = data is Map ? data['code']?.toString() : null;
      lastError = _friendlyError(code);
      if (code == 'INVALID_SESSION') {
        _sessionToken = null;
        unawaited(_secureStorage.delete(key: _sessionStorageKey));
      }
      notifyListeners();
    });

    _socket!.on('auth:success', _handleAuthenticated);
    _socket!.on('room:created', _handleRoomAcknowledgement);
    _socket!.on('room:joined', _handleRoomAcknowledgement);
    _socket!.on('room:sync', (data) {
      if (data is Map) {
        final roomData = data['room'];
        if (roomData is Map) {
          _applyRoomSnapshot(roomData);
        }
        notifyListeners();
      }
    });

    _socket!.on('chat:history', (data) {
      if (data is List) {
        chatMessages
          ..clear()
          ..addAll(data.whereType<Map>().map(_parseChatMessage));
        notifyListeners();
      }
    });

    _socket!.on('chat:message', (data) {
      if (data is Map) {
        chatMessages.add(_parseChatMessage(data));
        notifyListeners();
      }
    });

    _socket!.on('game:state_update', (data) {
      if (data is Map) {
        final gameState = data['gameState'];
        if (gameState is Map) {
          _applyGameSnapshot(gameState);
        }
        notifyListeners();
      }
    });

    _socket!.on('game:turn_changed', (data) {
      if (data is Map) {
        final gameState = data['gameState'];
        if (gameState is Map) {
          _applyGameSnapshot(gameState);
          notifyListeners();
        }
      }
    });

    _socket!.connect();
  }

  bool createRoom(String displayName) {
    if (!isConnected) {
      lastError = 'Connect to the game server before creating a room';
      notifyListeners();
      return false;
    }
    currentUserName = displayName.trim();
    roomCode = '';
    lastError = null;
    _queueRoomAction({'type': 'create', 'displayName': currentUserName});
    return true;
  }

  bool joinRoom(String enteredCode, String displayName) {
    if (!isConnected) {
      lastError = 'Connect to the game server before joining a room';
      notifyListeners();
      return false;
    }
    roomCode = enteredCode.trim();
    currentUserName = displayName.trim();
    isHost = false;
    lastError = null;
    _queueRoomAction({
      'type': 'join',
      'roomCode': roomCode,
      'displayName': currentUserName,
    });
    return true;
  }

  void _queueRoomAction(Map<String, String> action) {
    _pendingRoomAction = action;
    if (_playerId.isNotEmpty) {
      _dispatchRoomAction();
      return;
    }
    if (_sessionToken != null) return;
    _requestGuestAuthentication();
  }

  void _requestGuestAuthentication() {
    if (_authRequestPending) return;
    _authRequestPending = true;
    _socket?.emit('auth:guest', {
      'displayName': _pendingRoomAction?['displayName'],
    });
  }

  Future<void> _recoverExpiredSession() async {
    _recoveringExpiredSession = true;
    final oldSocket = _socket;
    _socket = null;
    _sessionToken = null;
    _playerId = '';
    _authRequestPending = false;
    try {
      await _secureStorage.delete(key: _sessionStorageKey);
    } catch (_) {}
    oldSocket?.dispose();
    if (!_disposed) _connectSocket();
    _recoveringExpiredSession = false;
  }

  void _handleAuthenticated(dynamic data) {
    unawaited(_acceptAuthenticated(data));
  }

  Future<void> _acceptAuthenticated(dynamic data) async {
    if (data is! Map) return;
    _playerId = data['playerId']?.toString() ?? _playerId;
    currentUserName = data['displayName']?.toString() ?? currentUserName;
    _sessionToken = data['sessionToken']?.toString() ?? _sessionToken;
    if (_lastRoomSnapshot != null) _applyRoomSnapshot(_lastRoomSnapshot!);
    _authRequestPending = false;
    connectionStatus = 'Connected';
    lastError = null;
    if (_sessionToken != null) {
      try {
        await _secureStorage.write(
          key: _sessionStorageKey,
          value: _sessionToken,
        );
      } catch (_) {
        lastError = 'Could not securely save your session';
      }
    }
    if (_disposed) return;
    notifyListeners();
    _dispatchRoomAction();
  }

  void _dispatchRoomAction() {
    final action = _pendingRoomAction;
    if (action == null || _playerId.isEmpty) return;
    _pendingRoomAction = null;
    if (action['type'] == 'create') {
      _socket?.emit('room:create', <String, String>{});
    } else {
      _socket?.emit('room:join', {'roomCode': action['roomCode']!});
    }
  }

  void startGame() {
    if (isHost && players.length >= 2) {
      _socket?.emit('game:start', roomCode);
    }
  }

  void sendChatMessage(String raw) {
    final message = raw.trim();
    if (!isConnected ||
        message.isEmpty ||
        message.length > 280 ||
        roomCode.isEmpty) {
      lastError =
          'Connect to the room and enter a message of at most 280 characters';
      notifyListeners();
      return;
    }

    _socket?.emit('chat:send', {'roomCode': roomCode, 'message': message});
  }

  int rollDice() {
    if (!gameStarted) {
      return 0;
    }
    _socket?.emit('game:roll_dice', {'roomCode': roomCode});
    return 0;
  }

  List<int> getLegalMovesForCurrentPlayer() {
    return List.unmodifiable(legalMoves);
  }

  void moveToken(int tokenIndex) {
    if (gameStarted && legalMoves.contains(tokenIndex)) {
      _socket?.emit('game:move_token', {
        'roomCode': roomCode,
        'tokenIndex': tokenIndex,
      });
    }
  }

  String get currentPlayerName =>
      gamePlayers.isEmpty ? 'Lobby' : gamePlayers[currentTurnIndex].name;
  String get winnerName {
    for (final player in gamePlayers) {
      if (player.playerId == winnerId) return player.name;
    }
    return 'Player';
  }

  bool get isConnected => _socket?.connected == true;
  bool get isMyTurn =>
      gamePlayers.isNotEmpty &&
      gamePlayers[currentTurnIndex].playerId == _playerId;
  bool isCurrentUser(String playerId) => playerId == _playerId;

  void _handleRoomAcknowledgement(dynamic data) {
    if (data is Map) {
      _playerId = data['playerId']?.toString() ?? _playerId;
      final roomData = data['room'];
      if (roomData is Map) {
        _applyRoomSnapshot(roomData);
      }
      notifyListeners();
    }
  }

  void _applyRoomSnapshot(Map roomData) {
    _lastRoomSnapshot = roomData;
    roomCode = roomData['code']?.toString() ?? roomCode;
    final roomPlayers = roomData['players'];
    if (roomPlayers is List) {
      players
        ..clear()
        ..addAll(
          roomPlayers.whereType<Map>().map((entry) {
            final id = entry['id']?.toString() ?? '';
            final name = entry['displayName']?.toString() ?? 'Player';
            Map? gamePlayer;
            final snapshotPlayers = (roomData['gameState'] as Map?)?['players'];
            if (snapshotPlayers is List) {
              for (final candidate in snapshotPlayers.whereType<Map>()) {
                if (candidate['playerId']?.toString() == id) {
                  gamePlayer = candidate;
                  break;
                }
              }
            }
            return LudoPlayer(
              id: id,
              name: name,
              color: _playerColor(
                gamePlayer?['color']?.toString(),
                entry['avatarColor']?.toString(),
              ),
              isHost: entry['isHost'] == true,
              isReady: entry['ready'] == true,
              isConnected: entry['connected'] == true,
            );
          }),
        );
    }
    isHost = roomData['hostId']?.toString() == _playerId;
    final state = roomData['gameState'];
    gameStarted = roomData['state'] == 'playing' && state is Map;
    gameFinished = roomData['state'] == 'finished';
    if (state is Map) {
      _applyGameSnapshot(state);
    } else {
      gamePlayers.clear();
      legalMoves.clear();
      currentTurnIndex = 0;
      diceValue = 0;
      winnerId = '';
    }
  }

  void _applyGameSnapshot(Map gameState) {
    currentTurnIndex =
        int.tryParse(gameState['currentTurnIndex']?.toString() ?? '') ?? 0;
    diceValue = int.tryParse(gameState['diceValue']?.toString() ?? '') ?? 0;
    winnerId = gameState['winnerId']?.toString() ?? '';
    legalMoves
      ..clear()
      ..addAll(
        (gameState['legalMoves'] as List? ?? [])
            .map((value) => int.tryParse(value.toString()) ?? -1)
            .where((value) => value >= 0),
      );

    final snapshotPlayers = gameState['players'];
    if (snapshotPlayers is! List) return;
    gamePlayers
      ..clear()
      ..addAll(
        snapshotPlayers.whereType<Map>().map((entry) {
          final playerId = entry['playerId']?.toString() ?? '';
          LudoPlayer? roomPlayer;
          for (final candidate in players) {
            if (candidate.id == playerId) {
              roomPlayer = candidate;
              break;
            }
          }
          final tokens = entry['tokens'] as List? ?? [];
          return LudoGamePlayerState(
            playerId: playerId,
            name: roomPlayer?.name ?? 'Player',
            color: _playerColor(entry['color']?.toString(), null),
            tokens: tokens
                .whereType<Map>()
                .map(
                  (token) => LudoTokenState(
                    tokenIndex:
                        int.tryParse(token['tokenIndex']?.toString() ?? '') ??
                        0,
                    position:
                        int.tryParse(token['position']?.toString() ?? '') ?? -1,
                    inHome: token['inHome'] == true,
                    isSafe: token['isSafe'] == true,
                    row: (token['boardCell'] as Map?)?['row'] is num
                        ? ((token['boardCell'] as Map)['row'] as num).toInt()
                        : null,
                    col: (token['boardCell'] as Map?)?['col'] is num
                        ? ((token['boardCell'] as Map)['col'] as num).toInt()
                        : null,
                  ),
                )
                .toList(),
          );
        }),
      );
  }

  Color _playerColor(String? gameColor, String? avatarColor) {
    switch (gameColor) {
      case 'green':
        return const Color(0xFF2ECC71);
      case 'yellow':
        return const Color(0xFFFBBF24);
      case 'red':
        return const Color(0xFFEF4444);
      case 'blue':
        return const Color(0xFF3B82F6);
    }
    final value = avatarColor?.replaceFirst('#', '');
    if (value != null && value.length == 6) {
      final parsed = int.tryParse(value, radix: 16);
      if (parsed != null) return Color(0xFF000000 | parsed);
    }
    return const Color(0xFF64748B);
  }

  String _friendlyError(String? code) {
    switch (code) {
      case 'INVALID_ROOM_CODE':
        return 'That room code was not found';
      case 'ROOM_ALREADY_STARTED':
        return 'This room has already started';
      case 'ROOM_FULL':
        return 'This room is full';
      case 'PLAYER_ALREADY_IN_ROOM':
        return 'That display name is already in this room';
      case 'MIN_PLAYERS_NOT_REACHED':
        return 'At least two players are needed to start';
      case 'NOT_YOUR_TURN':
        return 'It is another player’s turn';
      case 'MOVE_REQUIRED':
        return 'Move a legal token before rolling again';
      case 'ILLEGAL_MOVE':
        return 'That move is no longer legal';
      case 'HOST_ONLY':
        return 'Only the room host can start the game';
      case 'NOT_IN_ROOM':
        return 'Join the room before sending chat';
      case 'RATE_LIMITED':
        return 'Too many requests. Wait a moment and try again';
      case 'CHAT_LINKS_NOT_ALLOWED':
        return 'Room chat does not allow links';
      case 'CHAT_MODERATED':
        return 'That message could not be sent';
      default:
        return 'The request could not be completed';
    }
  }

  ChatMessage _parseChatMessage(Map message) {
    return ChatMessage(
      playerId: message['playerId']?.toString() ?? 'unknown',
      playerName: message['playerName']?.toString() ?? 'Player',
      message: message['message']?.toString() ?? '',
      createdAt:
          DateTime.tryParse(message['createdAt']?.toString() ?? '') ??
          DateTime.now(),
    );
  }

  @override
  void dispose() {
    _disposed = true;
    _socket?.dispose();
    super.dispose();
  }
}
