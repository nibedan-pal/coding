import java.util.Scanner;

class GCDCalculator {

    static int calculateGCD(int a, int b) {
        while (b != 0) {
            int remainder = a % b;
            a = b;
            b = remainder;
        }
        return a;
    }

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter the first number: ");
        int number1 = scanner.nextInt();

        System.out.print("Enter the second number: ");
        int number2 = scanner.nextInt();

        int gcdResult = calculateGCD(number1, number2);

        System.out.println("The GCD of " + number1 + " and " + number2 + " is: " + gcdResult);

        scanner.close();
    }
}
