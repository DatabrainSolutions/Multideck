using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocumentSecuritySignatureAlgorithm
{
    public string DocsecsaCode { get; set; } = null!;

    public string DocsecsaName { get; set; } = null!;

    public string? DocsecsaDescription { get; set; }

    public bool DocsecsaIsCryptographicSignature { get; set; }

    public int DocsecsaSortOrder { get; set; }

    public bool DocsecsaIsActive { get; set; }

    public DateTime DocsecsaCreatedAt { get; set; }

    public virtual ICollection<DocsecDocumentSignature> DocsecDocumentSignatures { get; set; } = new List<DocsecDocumentSignature>();

    public virtual ICollection<DocsecSigningKey> DocsecSigningKeys { get; set; } = new List<DocsecSigningKey>();
}
