using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Signature and attestation records for AWB issue and electronic acceptance.
/// </summary>
public partial class AwbSignature
{
    public Guid AwbsigId { get; set; }

    public Guid AwbsigAwbid { get; set; }

    public string AwbsigSignatureRole { get; set; } = null!;

    public string? AwbsigSignedByName { get; set; }

    public Guid? AwbsigSignedByUserId { get; set; }

    public Guid? AwbsigSignedForOrgId { get; set; }

    public string? AwbsigSignedForNameSnapshot { get; set; }

    public DateTime? AwbsigSignedAt { get; set; }

    public string? AwbsigSignedAtPlace { get; set; }

    public string? AwbsigSignatureMethod { get; set; }

    public string? AwbsigSignatureHash { get; set; }

    public string? AwbsigCertificateReference { get; set; }

    public string? AwbsigNotes { get; set; }

    public DateTime AwbsigCreatedAt { get; set; }

    public virtual AwbHeader AwbsigAwb { get; set; } = null!;
}
