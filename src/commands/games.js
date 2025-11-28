/**
 * Handles the rock-paper-scissors game.
 * @param {object} ctx - The context object.
 * @returns {object} The result of the game.
 */
export async function rps(ctx) {
  const choices = ["rock", "paper", "scissors"];
  const userChoice = (ctx.args[0] || "").toLowerCase();

  if (!choices.includes(userChoice)) {
    return {
      success: false,
      message: "Please choose rock, paper, or scissors.",
    };
  }

  const botChoice = choices[Math.floor(Math.random() * choices.length)];

  let result;
  if (userChoice === botChoice) {
    result = "It's a tie!";
  } else if (
    (userChoice === "rock" && botChoice === "scissors") ||
    (userChoice === "paper" && botChoice === "rock") ||
    (userChoice === "scissors" && botChoice === "paper")
  ) {
    result = "You win!";
  } else {
    result = "You lose!";
  }

  return {
    success: true,
    message: `You chose ${userChoice}, bot chose ${botChoice}. ${result}`,
  };
}
