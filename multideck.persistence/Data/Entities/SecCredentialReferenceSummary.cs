using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecCredentialReferenceSummary
{
    public Guid? CredentialId { get; set; }

    public string? CredentialCode { get; set; }

    public string? CredentialName { get; set; }

    public string? CredentialTypeCode { get; set; }

    public string? StatusCode { get; set; }

    public string? ModuleCode { get; set; }

    public string? ProviderCode { get; set; }

    public Guid? OrgOfficeId { get; set; }

    public string? VaultProvider { get; set; }

    public string? PublicFingerprint { get; set; }

    public DateTime? ExpiresAt { get; set; }

    public DateTime? RotationDueAt { get; set; }

    public bool? IsExpired { get; set; }

    public bool? IsRotationOverdue { get; set; }
}
