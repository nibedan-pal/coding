import java.util.Scanner;

class FibonacciSeries {

    static void printFibonacciSeries(int n) {
        int first = 0, second = 1;

        System.out.print("Fibonacci Series up to " + n + " terms: ");

        for (int i = 1; i <= n; i++) {
            System.out.print(first + " ");

            int next = first + second;
            first = second;
            second = next;
        }
    }

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter the number of terms (n) for the Fibonacci series: ");
        int n = scanner.nextInt();

        printFibonacciSeries(n);

        scanner.close();
    }
}
