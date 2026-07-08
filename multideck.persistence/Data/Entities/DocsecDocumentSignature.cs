using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsecDocumentSignature
{
    public Guid DocsecsigId { get; set; }

    public Guid DocsecsigFingerprintId { get; set; }

    public Guid? DocsecsigSigningKeyId { get; set; }

    public string DocsecsigAlgorithmCode { get; set; } = null!;

    public string DocsecsigSignatureValue { get; set; } = null!;

    public string DocsecsigProofJson { get; set; } = null!;

    public DateTime DocsecsigSignedAt { get; set; }

    public Guid? DocsecsigSignedBy { get; set; }

    public DateTime? DocsecsigVerifiedAt { get; set; }

    public bool? DocsecsigIsValid { get; set; }

    public string DocsecsigMetadataJson { get; set; } = null!;

    public virtual SysDocumentSecuritySignatureAlgorithm DocsecsigAlgorithmCodeNavigation { get; set; } = null!;

    public virtual DocsecDocumentFingerprint DocsecsigFingerprint { get; set; } = null!;

    public virtual CmpUser? DocsecsigSignedByNavigation { get; set; }

    public virtual DocsecSigningKey? DocsecsigSigningKey { get; set; }
}
