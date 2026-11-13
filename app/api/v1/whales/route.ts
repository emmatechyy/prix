import { getWhales } from "@/lib/model/whales";
import { fail, json } from "@/lib/api";

export const revalidate = 600;

export async function GET() {
  try {
    return json(await getWhales());
  } catch (e) {
    return fail(e);
  }
}
