using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocumentSecurityTokenStatus
{
    public string DocsectsCode { get; set; } = null!;

    public string DocsectsName { get; set; } = null!;

    public bool DocsectsIsValidForPublicVerification { get; set; }

    public bool DocsectsIsFinal { get; set; }

    public int DocsectsSortOrder { get; set; }

    public bool DocsectsIsActive { get; set; }

    public DateTime DocsectsCreatedAt { get; set; }

    public virtual ICollection<DocsecVerificationToken> DocsecVerificationTokens { get; set; } = new List<DocsecVerificationToken>();
}
