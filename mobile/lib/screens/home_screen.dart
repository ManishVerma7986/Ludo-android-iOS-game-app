import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../models/ludo_room.dart';
import 'game_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _controller = TextEditingController();
  final TextEditingController _nameController = TextEditingController();
  String? _validationError;

  @override
  void dispose() {
    _controller.dispose();
    _nameController.dispose();
    super.dispose();
  }

  bool _validDisplayName() {
    final name = _nameController.text.trim();
    if (name.length < 2 || name.length > 18) {
      setState(
        () => _validationError = 'Display name must be 2 to 18 characters',
      );
      return false;
    }
    return true;
  }

  void _createRoom() {
    if (!_validDisplayName()) return;
    final joined = context.read<LudoRoomController>().createRoom(
      _nameController.text,
    );
    if (!joined) return;
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => const GameScreen()));
  }

  void _joinRoom() {
    if (!_validDisplayName()) return;
    final code = _controller.text.trim();
    if (!RegExp(r'^[0-9]{8}$').hasMatch(code)) {
      setState(() => _validationError = 'Enter the 8-digit room code');
      return;
    }
    final joined = context.read<LudoRoomController>().joinRoom(
      code,
      _nameController.text,
    );
    if (!joined) return;
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => const GameScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final room = context.watch<LudoRoomController>();
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight:
                  MediaQuery.of(context).size.height -
                  MediaQuery.of(context).padding.top -
                  MediaQuery.of(context).padding.bottom,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.games_rounded,
                  size: 80,
                  color: Color(0xFF6D5EF6),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Ludo Multiplayer',
                  style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Create a private room or join an invite code to play with friends.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, color: Colors.black54),
                ),
                const SizedBox(height: 12),
                Text(
                  room.lastError ?? room.connectionStatus,
                  style: TextStyle(
                    color: room.lastError == null ? Colors.black54 : Colors.red,
                  ),
                ),
                const SizedBox(height: 32),
                TextField(
                  controller: _nameController,
                  maxLength: 18,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: 'Display name',
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  onChanged: (_) => setState(() => _validationError = null),
                ),
                if (_validationError != null)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      _validationError!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _createRoom,
                    icon: const Icon(Icons.add_box_rounded),
                    label: const Text('Create Private Room'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      backgroundColor: const Color(0xFF6D5EF6),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _controller,
                  keyboardType: TextInputType.number,
                  maxLength: 8,
                  decoration: InputDecoration(
                    labelText: 'Room code',
                    hintText: '8 digits',
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    suffixIcon: const Icon(Icons.key_rounded),
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _joinRoom,
                    icon: const Icon(Icons.login_rounded),
                    label: const Text('Join Room'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      foregroundColor: const Color(0xFF1F2937),
                      side: const BorderSide(color: Color(0xFFCBD5E1)),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
