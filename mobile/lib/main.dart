import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import 'models/ludo_room.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(const LudoGameApp());
}

class LudoGameApp extends StatelessWidget {
  const LudoGameApp({super.key, this.connectToServer = true});

  final bool connectToServer;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => LudoRoomController(connectToServer: connectToServer),
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Ludo Multiplayer',
        theme: ThemeData(
          useMaterial3: true,
          colorSchemeSeed: const Color(0xFF6D5EF6),
          scaffoldBackgroundColor: const Color(0xFFF5F7FF),
        ),
        home: const HomeScreen(),
      ),
    );
  }
}
