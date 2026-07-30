using System.Security.Claims;

namespace Multideck.Server.Modules.CrmPipelines;

public interface ICrmPipelineService
{
    Task<CrmPipelineSettingsDto> GetSettingsAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<CrmPipelineDto> CreatePipelineAsync(ClaimsPrincipal user, SaveCrmPipelineRequest request, CancellationToken cancellationToken);
    Task<CrmPipelineDto> SavePipelineAsync(ClaimsPrincipal user, Guid pipelineId, SaveCrmPipelineRequest request, CancellationToken cancellationToken);
    Task DeletePipelineAsync(ClaimsPrincipal user, Guid pipelineId, CancellationToken cancellationToken);
    Task<IReadOnlyList<CrmPipelineDto>> ReorderPipelinesAsync(ClaimsPrincipal user, ReorderCrmPipelinesRequest request, CancellationToken cancellationToken);
    Task<CrmLeadFieldDto> CreateLeadFieldAsync(ClaimsPrincipal user, CreateCrmLeadFieldRequest request, CancellationToken cancellationToken);
    Task<CrmLeadFieldDto> SaveLeadFieldAsync(ClaimsPrincipal user, Guid fieldId, SaveCrmLeadFieldRequest request, CancellationToken cancellationToken);
    Task DeleteLeadFieldAsync(ClaimsPrincipal user, Guid fieldId, CancellationToken cancellationToken);
    Task<IReadOnlyList<CrmLeadFieldDto>> ReorderLeadFieldsAsync(ClaimsPrincipal user, ReorderCrmLeadFieldsRequest request, CancellationToken cancellationToken);
}
