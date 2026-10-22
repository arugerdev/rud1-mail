import type { Metadata } from "next";

import { avatarVersions, fullName, getProfile } from "@/lib/profiles";
import { requireUser } from "@/lib/session";
import { TEMPLATE_VARIABLES } from "@/lib/templates";

import { ProfileSettings } from "./profile-settings";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = getProfile(user.email, user.name);
  return (
    <ProfileSettings
      email={user.email}
      name={fullName(profile)}
      profile={{
        firstName: profile.firstName,
        lastName: profile.lastName,
        position: profile.position,
        department: profile.department,
        phone: profile.phone,
      }}
      avatarVersion={profile.avatarVersion}
      hasAvatar={Boolean(avatarVersions()[user.email])}
      signatureHtml={profile.signatureHtml}
      prefs={profile.prefs}
      variables={TEMPLATE_VARIABLES}
    />
  );
}
