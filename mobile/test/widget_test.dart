// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ludo_multiplayer/main.dart';
import 'package:ludo_multiplayer/models/ludo_room.dart';
import 'package:ludo_multiplayer/screens/game_screen.dart';

void main() {
  testWidgets('app loads the Ludo home screen', (WidgetTester tester) async {
    await tester.pumpWidget(const LudoGameApp(connectToServer: false));

    expect(find.text('Ludo Multiplayer'), findsOneWidget);
    expect(find.text('Create Private Room'), findsOneWidget);
  });

  testWidgets('requires a display name before joining', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const LudoGameApp(connectToServer: false));
    await tester.tap(find.text('Join Room'));
    await tester.pump();

    expect(
      find.text('Display name must be 2 to 18 characters'),
      findsOneWidget,
    );
  });

  testWidgets('only server-legal tokens can be selected on the board', (
    WidgetTester tester,
  ) async {
    final player = LudoGamePlayerState(
      playerId: 'player-1',
      name: 'Player One',
      color: const Color(0xFF2ECC71),
      tokens: List.generate(4, (index) => LudoTokenState(tokenIndex: index)),
    );
    var selectedToken = -1;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 300,
              height: 300,
              child: LudoBoard(
                gamePlayers: [player],
                currentTurnIndex: 0,
                legalTokenIndices: const [1],
                onTokenSelected: (tokenIndex) => selectedToken = tokenIndex,
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.bySemanticsLabel('Token 1'));
    expect(selectedToken, -1);
    await tester.tap(find.bySemanticsLabel('Token 2'));
    expect(selectedToken, 1);
  });
}
