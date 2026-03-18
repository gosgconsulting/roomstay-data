import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function SlidesPage() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();

  useEffect(() => {
    navigate(`/tools/reports`, { replace: true });
  }, [navigate]);

  return null;
}

