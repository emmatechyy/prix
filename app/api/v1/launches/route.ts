import { getLaunches } from "@/lib/model/launches";
import { fail, json } from "@/lib/api";

export const revalidate = 600;

export async function GET() {
  try {
    return json(await getLaunches());
  } catch (e) {
    return fail(e);
  }
}
