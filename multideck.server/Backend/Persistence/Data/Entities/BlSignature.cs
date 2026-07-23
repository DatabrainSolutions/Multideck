using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlSignature
{
    public Guid BlsId { get; set; }

    public Guid BlsBlId { get; set; }

    public string BlsSignatureType { get; set; } = null!;

    public Guid? BlsSignedByUserId { get; set; }

    public string BlsSignedByName { get; set; } = null!;

    public string? BlsSignedByTitle { get; set; }

    public Guid? BlsSignedForOrgId { get; set; }

    public string? BlsSignedForNameSnapshot { get; set; }

    public DateTime BlsSignedAt { get; set; }

    public string? BlsSignatureLocationSnapshot { get; set; }

    public string? BlsCertificateId { get; set; }

    public string? BlsSignatureHash { get; set; }

    public string BlsRawSignaturePayload { get; set; } = null!;

    public virtual BlHeader BlsBl { get; set; } = null!;
}
